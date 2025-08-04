// Default proxy settings
const DEFAULT_PROXY_SETTINGS = {
  host: '',
  port: '',
  username: '',
  password: ''
};

// Import domain list functions
import { getStoredDomainList, isDomainInList, addDomainToList, removeDomainFromList } from './domainLists.js';

// Initialize proxy settings on extension install or update
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed - initializing default settings');
  
  // Set default settings if they don't exist
  const settings = await chrome.storage.local.get([
    'proxyHost', 'proxyPort', 'proxyUsername', 'proxyPassword', 
    'proxyEnabled', 'onlyRefilterDomains'
  ]);
  
  const newSettings = {
    proxyHost: settings.proxyHost || DEFAULT_PROXY_SETTINGS.host,
    proxyPort: settings.proxyPort || DEFAULT_PROXY_SETTINGS.port,
    proxyUsername: settings.proxyUsername || DEFAULT_PROXY_SETTINGS.username,
    proxyPassword: settings.proxyPassword || DEFAULT_PROXY_SETTINGS.password,
    proxyEnabled: settings.proxyEnabled !== undefined ? settings.proxyEnabled : false,
    onlyRefilterDomains: settings.onlyRefilterDomains !== undefined ? settings.onlyRefilterDomains : false
  };
  
  await chrome.storage.local.set(newSettings);
  
  // Apply proxy settings based on stored configuration
  await updateProxySettings();
});

// Register authentication listener when extension loads
chrome.webRequest.onAuthRequired.addListener(
  handleAuthRequest,
  { urls: ["<all_urls>"] },
  ['asyncBlocking']
);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message.action);
  console.log('Full message:', JSON.stringify(message));
  
  switch (message.action) {
    case 'updateProxySettings':
      // Update proxy settings based on the message
      updateProxySettings(message)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          console.error('Error updating proxy:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Indicates async response
      
    case 'addDomainToList':
      // Add domain to the proxy list
      if (!message.domain) {
        sendResponse({ success: false, error: 'Domain not specified' });
        return true;
      }
      
      addDomainToList(message.domain)
        .then(result => {
          sendResponse({ success: true, ...result });
          // If domain was added successfully, update proxy settings
          if (result.success && !result.alreadyExists) {
            return updateProxySettings();
          }
        })
        .catch(error => {
          console.error('Error adding domain:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
      
    case 'removeDomainFromList':
      // Remove domain from the proxy list
      console.log('Processing remove domain request for:', message.domain);
      
      if (!message.domain) {
        console.error('No domain specified in remove request');
        sendResponse({ success: false, error: 'Domain not specified' });
        return true;
      }
      
      removeDomainFromList(message.domain)
        .then(result => {
          console.log('Remove domain result:', JSON.stringify(result));
          sendResponse({ success: true, ...result });
          // If domain was removed successfully, update proxy settings
          if (result.success && !result.notFound) {
            return updateProxySettings();
          }
        })
        .catch(error => {
          console.error('Error removing domain:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
      
    default:
      console.log('Unknown action:', message.action);
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
  }
});

// Configure and update proxy settings
async function updateProxySettings(options = {}) {
  try {
    // Get current settings
    const settings = await chrome.storage.local.get([
      'proxyEnabled', 'proxyHost', 'proxyPort', 'proxyUsername', 'proxyPassword',
      'onlyRefilterDomains'
    ]);
    
    // Update with any new options passed in
    if (options.proxyEnabled !== undefined) {
      settings.proxyEnabled = options.proxyEnabled;
    }
    
    if (options.onlyRefilterDomains !== undefined) {
      settings.onlyRefilterDomains = options.onlyRefilterDomains;
    }
    
    console.log('Current proxy settings:', 
      settings.proxyEnabled ? 'Enabled' : 'Disabled',
      settings.onlyRefilterDomains ? '(Only selected domains)' : '(All traffic)');
    
    // If proxy is disabled, clear proxy settings
    if (!settings.proxyEnabled) {
      await chrome.proxy.settings.clear({ scope: 'regular' });
      console.log('Proxy settings cleared');
      return;
    }
    
    if (settings.onlyRefilterDomains) {
      // Get the domain list if in selective mode
      const { domains } = await getStoredDomainList();
      
      if (!domains || domains.length === 0) {
        console.warn('Domain list is empty in selective mode');
      }
      
      // Configure PAC script for selective proxy routing
      const pacScript = `
        function FindProxyForURL(url, host) {
          // Proxy host and port
          var proxy = "PROXY ${settings.proxyHost}:${settings.proxyPort}";
          var direct = "DIRECT";
          
          // Convert host to lowercase
          host = host.toLowerCase();
          
          // Domain list for proxying
          var domainList = ${JSON.stringify(domains)};
          
          // Check for TLD matches (entries starting with dot)
          for (var i = 0; i < domainList.length; i++) {
            var domain = domainList[i];
            if (domain.charAt(0) === '.' && host.endsWith(domain)) {
              return proxy;
            }
          }
          
          // Direct match
          if (domainList.indexOf(host) !== -1) {
            return proxy;
          }
          
          // Check for subdomain matches
          var parts = host.split('.');
          for (var i = 1; i < parts.length; i++) {
            var parentDomain = parts.slice(i).join('.');
            if (domainList.indexOf(parentDomain) !== -1) {
              return proxy;
            }
          }
          
          // Default to direct connection
          return direct;
        }
      `;
      
      // Apply proxy PAC script
      await chrome.proxy.settings.set({
        value: {
          mode: "pac_script",
          pacScript: {
            data: pacScript
          }
        },
        scope: 'regular'
      });
      
      console.log('PAC script proxy settings applied for selective domains');
    } else {
      // Regular proxy for all traffic
      const config = {
        mode: "fixed_servers",
        rules: {
          singleProxy: {
            scheme: "http",
            host: settings.proxyHost,
            port: parseInt(settings.proxyPort)
          },
          bypassList: []
        }
      };
      
      await chrome.proxy.settings.set({
        value: config,
        scope: 'regular'
      });
      
      console.log('Fixed server proxy settings applied for all traffic');
    }
  } catch (error) {
    console.error('Error updating proxy settings:', error);
    throw error;
  }
}

// Handle proxy authentication requests
function handleAuthRequest(details, callback) {
  console.log('Auth request received for:', details.url);
  
  // Get current proxy settings
  chrome.storage.local.get([
    'proxyEnabled', 'proxyUsername', 'proxyPassword', 'proxyHost', 'proxyPort'
  ], function(settings) {
    // Only handle auth for our configured proxy
    if (!settings.proxyEnabled) {
      console.log('Proxy disabled, not providing auth');
      callback();
      return;
    }
    
    // Check if this is our proxy server
    if (details.challenger && details.challenger.host) {
      let challengerHost = details.challenger.host;
      let challengerPort = details.challenger.port;
      
      console.log(`Auth challenger: ${challengerHost}:${challengerPort}`);
      console.log(`Our proxy: ${settings.proxyHost}:${settings.proxyPort}`);
      
      // Make sure we're authenticating for our proxy
      if (challengerHost === settings.proxyHost && 
          (challengerPort === parseInt(settings.proxyPort) || challengerPort === settings.proxyPort)) {
        
        console.log('Providing authentication for our proxy server');
        
        // Provide authentication credentials
        if (settings.proxyUsername && settings.proxyPassword) {
          callback({
            authCredentials: {
              username: settings.proxyUsername,
              password: settings.proxyPassword
            }
          });
          return;
        }
      }
    }
    
    // Default fallback - no auth provided
    console.log('Not providing auth (no matching proxy or no credentials)');
    callback();
  });
}

// Обновим исходную функцию isBlockedSite, чтобы включить дополнительную проверку
async function isBlockedSite(domain) {
  try {
    // Список известных заблокированных доменов
    const knownBlockedSites = [
      'jabra.com',
      'www.jabra.com'
    ];
    
    // Проверяем сначала известные заблокированные сайты
    if (knownBlockedSites.includes(domain.toLowerCase())) {
      return true;
    }
    
    // Затем проверяем по списку доменов
    const { domains } = await getStoredDomainList();
    return isDomainInList(domain, domains);
  } catch (error) {
    console.error('Error checking blocked status:', error);
    return false;
  }
}

// Listen for errors on web requests to detect blocked sites
chrome.webRequest.onErrorOccurred.addListener(
  async function(details) {
    // Only check for errors on main frame requests
    if (details.type !== 'main_frame') {
      return;
    }
    
    console.log(`Error detected on ${details.url}: ${details.error}`);
    
    // Removed notification functionality - no longer showing notifications for blocked sites
  },
  { urls: ["<all_urls>"] }
);

// Add an additional listener for completed requests to detect redirects and other signs of blocking
chrome.webRequest.onCompleted.addListener(
  async function(details) {
    // Only check main frame requests
    if (details.type !== 'main_frame') {
      return;
    }
    
    // Check for redirects to known ISP block pages or unusual status codes
    const suspiciousStatusCodes = [451]; // 451 = Unavailable For Legal Reasons
    
    if (suspiciousStatusCodes.includes(details.statusCode)) {
      // Removed notification functionality - no longer showing notifications for suspicious status codes
      console.log(`Suspicious status code detected on ${details.url}: ${details.statusCode}`);
    }
  },
  { urls: ["<all_urls>"] }
);

// Listen for ALL completed web requests to detect potential blocks
chrome.webRequest.onCompleted.addListener(
  async function(details) {
    // Only check main frame requests
    if (details.type !== 'main_frame') {
      return;
    }
    
    try {
      // Extract domain from URL
      const url = new URL(details.url);
      const domain = url.hostname;
      
      console.log(`Completed request to ${domain} with status: ${details.statusCode}`);
      
      // Check if it's a known blocked site that we want to specifically monitor
      const isKnownBlockedSite = isBlockedSite(domain);
      
      if (isKnownBlockedSite) {
        console.log(`Known blocked site detected: ${domain}`);
        // Removed notification functionality - no longer showing notifications for known blocked sites
      }
    } catch (error) {
      console.error('Error processing completed request:', error);
    }
  },
  { urls: ["<all_urls>"] }
);

// Handle notification button clicks - removed notification functionality
// chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
//   // Removed notification button handling - no longer showing notifications
// }); 