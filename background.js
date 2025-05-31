// Default proxy settings
const DEFAULT_PROXY_SETTINGS = {
  host: 'XX.XX.XX.XX',
  port: 'XXXX',
  username: 'XXXX',
  password: 'XXXX'
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
    
    try {
      // Extract domain from URL before any other checks
      const url = new URL(details.url);
      const domain = url.hostname;
      
      // Check if proxy is enabled and in selective mode
      const settings = await chrome.storage.local.get([
        'proxyEnabled', 'onlyRefilterDomains'
      ]);
      
      console.log(`Current proxy settings for error check: Enabled=${settings.proxyEnabled}, SelectiveMode=${settings.onlyRefilterDomains}`);
      
      if (!settings.proxyEnabled || !settings.onlyRefilterDomains) {
        console.log(`Skipping notification for ${domain} - proxy is off or not in selective mode`);
        return; // Don't show notifications if proxy is off or not in selective mode
      }
      
      // Don't suggest adding local addresses, extensions, or browser internal pages
      if (domain === 'localhost' || 
          domain.includes('127.0.0.1') || 
          domain.includes('::1') ||
          domain.endsWith('.local') ||
          domain.startsWith('chrome-extension://') ||
          domain.startsWith('chrome://') ||
          domain.startsWith('edge://') ||
          domain.startsWith('about:') ||
          domain.startsWith('file://')) {
        console.log(`Skipping internal domain: ${domain}`);
        return;
      }
      
      // Get current domain list
      const { domains } = await getStoredDomainList();
      
      // Check if domain is already in the list
      if (isDomainInList(domain, domains)) {
        console.log(`Domain ${domain} already in list, skipping notification`);
        return; // Domain already in the list, no need to suggest
      }
      
      // Create a unique ID for this blocked site to avoid duplicate notifications
      const notificationId = `access_error_${domain}_${Date.now()}`;
      
      console.log(`Preparing to show notification for ${domain}`);
      
      // Show notification
      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: 'images/128.png',
        title: 'Сайт недоступен',
        message: `Сайт ${domain} недоступен. Добавить его в список для обхода блокировки?`,
        buttons: [
          { title: 'Добавить' },
          { title: 'Отмена' }
        ],
        priority: 2,
        requireInteraction: true
      }, (createdId) => {
        if (chrome.runtime.lastError) {
          console.error('Error creating notification:', chrome.runtime.lastError);
        } else {
          console.log(`Notification shown for blocked site: ${domain} with ID: ${createdId}`);
        }
      });
    } catch (error) {
      console.error('Error processing access error:', error);
    }
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
      try {
        // Check if proxy is enabled and in selective mode
        const settings = await chrome.storage.local.get([
          'proxyEnabled', 'onlyRefilterDomains'
        ]);
        
        if (!settings.proxyEnabled || !settings.onlyRefilterDomains) {
          return; // Don't show notifications if proxy is off or not in selective mode
        }
        
        // Extract domain from URL
        const url = new URL(details.url);
        const domain = url.hostname;
        
        // Skip special domains
        if (domain === 'localhost' || 
            domain.includes('127.0.0.1') || 
            domain.endsWith('.local') ||
            domain.startsWith('chrome-extension://')) {
          return;
        }
        
        // Get current domain list
        const { domains } = await getStoredDomainList();
        
        // Check if domain is already in the list
        if (isDomainInList(domain, domains)) {
          return; // Domain already in the list, no need to suggest
        }
        
        // Create a unique ID for this blocked site
        const notificationId = `block_detected_${domain}_${Date.now()}`;
        
        // Check if we recently showed a notification for this domain
        const lastNotificationTime = await chrome.storage.local.get('lastNotification_' + domain);
        const currentTime = Date.now();
        
        if (!lastNotificationTime['lastNotification_' + domain] || 
            (currentTime - lastNotificationTime['lastNotification_' + domain]) > 5 * 60 * 1000) {
          
          // Store the last notification time
          await chrome.storage.local.set({
            ['lastNotification_' + domain]: currentTime
          });
          
          // Show notification
          chrome.notifications.create(notificationId, {
            type: 'basic',
            iconUrl: 'images/128.png',
            title: 'Возможная блокировка',
            message: `Сайт ${domain} может быть заблокирован. Добавить его в список для обхода блокировки?`,
            buttons: [
              { title: 'Добавить' },
              { title: 'Отмена' }
            ],
            priority: 2,
            requireInteraction: true
          });
          
          console.log(`Notification shown for suspicious status code on: ${domain}`);
        }
      } catch (error) {
        console.error('Error processing suspicious status:', error);
      }
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
        
        // Check if proxy is enabled and in selective mode
        const settings = await chrome.storage.local.get([
          'proxyEnabled', 'onlyRefilterDomains'
        ]);
        
        if (!settings.proxyEnabled || !settings.onlyRefilterDomains) {
          console.log(`Skipping notification for ${domain} - proxy is off or not in selective mode`);
          return;
        }
        
        // Get current domain list
        const { domains } = await getStoredDomainList();
        
        // Check if domain is already in the list
        if (isDomainInList(domain, domains)) {
          console.log(`Domain ${domain} already in list, skipping notification`);
          return;
        }
        
        // Create a notification for this known blocked site
        const notificationId = `known_blocked_${domain}_${Date.now()}`;
        
        chrome.notifications.create(notificationId, {
          type: 'basic',
          iconUrl: 'images/128.png',
          title: 'Заблокированный сайт обнаружен',
          message: `Сайт ${domain} заблокирован. Добавить его в список для обхода блокировки?`,
          buttons: [
            { title: 'Добавить' },
            { title: 'Отмена' }
          ],
          priority: 2,
          requireInteraction: true
        }, (createdId) => {
          if (chrome.runtime.lastError) {
            console.error('Error creating notification:', chrome.runtime.lastError);
          } else {
            console.log(`Notification shown for known blocked site: ${domain} with ID: ${createdId}`);
          }
        });
      }
    } catch (error) {
      console.error('Error processing completed request:', error);
    }
  },
  { urls: ["<all_urls>"] }
);

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  // Extract domain from notification ID
  let domain = null;
  
  if (notificationId.startsWith('access_error_')) {
    domain = notificationId.split('_')[2]; // Format: access_error_domain_timestamp
  } else if (notificationId.startsWith('block_detected_')) {
    domain = notificationId.split('_')[2]; // Format: block_detected_domain_timestamp
  } else if (notificationId.startsWith('known_blocked_')) {
    domain = notificationId.split('_')[2]; // Format: known_blocked_domain_timestamp
  }
  
  if (domain && buttonIndex === 0) { // "Add" button clicked
    try {
      console.log(`Adding domain from notification: ${domain}`);
      const result = await addDomainToList(domain);
      
      if (result.success) {
        chrome.notifications.create(`domain_added_${domain}_${Date.now()}`, {
          type: 'basic',
          iconUrl: 'images/128.png',
          title: 'Домен добавлен',
          message: `${domain} успешно добавлен в список проксируемых сайтов.`,
          priority: 1
        });
        
        // Update proxy settings to apply changes
        await updateProxySettings();
      }
    } catch (error) {
      console.error('Error adding domain from notification:', error);
      chrome.notifications.create(`error_${Date.now()}`, {
        type: 'basic',
        iconUrl: 'images/128.png',
        title: 'Ошибка',
        message: `Не удалось добавить домен: ${error.message}`,
        priority: 1
      });
    }
  }
  
  // Close the notification
  chrome.notifications.clear(notificationId);
}); 