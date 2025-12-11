// Domain lists management using local file
const DOMAIN_LISTS = {
  // Main list from local file
  LOCAL_FILE: 'domain.txt'
};

// Storage keys
const STORAGE_KEYS = {
  DOMAIN_LIST: 'domainList',
  SELECTED_LIST: 'selectedListType',
  LAST_UPDATE: 'lastDomainListUpdate',
  PERMANENT_DOMAINS: 'permanentDomainList'
};

// List types
const LIST_TYPES = {
  LOCAL_FILE: 'local_file'
};

// Known domain families that require extra external domains (different base domains)
// These are domains that are not subdomains but are required for full site functionality
const DOMAIN_DEPENDENCIES = {
  'twitch.tv': [
    'twitchcdn.net',  // External CDN
    'ttvnw.net',      // External CDN
    'jtvnw.net'       // External CDN
  ]
};

// Derive base domain (e.g., www.example.com -> example.com, sub.example.com -> example.com)
function getBaseDomain(domain) {
  const parts = domain.split('.').filter(Boolean);
  if (parts.length <= 2) return domain.toLowerCase();
  // Keep last two parts (e.g., example.com, co.uk)
  const last = parts.slice(-2).join('.');
  return last.toLowerCase();
}

// Read and process domain list from local file
async function loadLocalDomainList() {
  try {
    console.log('Loading domain list from local file:', DOMAIN_LISTS.LOCAL_FILE);
    
    const response = await fetch(chrome.runtime.getURL(DOMAIN_LISTS.LOCAL_FILE));
    if (!response.ok) {
      throw new Error(`Failed to load local file: ${response.status}`);
    }
    
    const text = await response.text();
    console.log(`Got ${text.length} bytes from local file`);
    
    // Parse domains - each domain is on a new line
    const domains = text.split('\n')
      .map(line => line.trim())
      .filter(domain => domain && !domain.startsWith('#')) // Remove empty lines and comments
      .map(domain => domain.toLowerCase()); // Convert to lowercase
    
    console.log(`Parsed ${domains.length} domains from local file`);
    
    // Check if critical domains are included (only base domains)
    const criticalDomains = [
      'chatgpt.com',
      'openai.com',
      'x.com',
      'twitter.com',
      'twitch.tv',
      'twitchcdn.net', // External CDN for Twitch
      'ttvnw.net',     // External CDN for Twitch
      'jtvnw.net'      // External CDN for Twitch
    ];
    let domainsSet = new Set(domains);
    
    for (const domain of criticalDomains) {
      const base = getBaseDomain(domain);
      if (!domainsSet.has(base)) {
        console.log(`Adding critical domain that was missing: ${base}`);
        domainsSet.add(base);
      }
    }
    
    const allDomains = Array.from(domainsSet);
    console.log(`Final domain count: ${allDomains.length}`);
    
    return allDomains;
  } catch (error) {
    console.error('Error loading local domain list:', error);
    // Return a fallback list with critical domains when load fails
    return ['chatgpt.com', 'openai.com', 'x.com', 'twitter.com'];
  }
}

// Validate if a string is a reasonable domain name
function isValidDomain(domain) {
  // Simple validation for domain format
  if (!domain || typeof domain !== 'string') {
    return false;
  }
  
  // Check for valid domain format
  // Domains must have at least one dot and contain only valid characters
  // Also checking for special case where entry starts with a dot (like .com)
  if (domain.startsWith('.')) {
    const validTLDRegex = /^\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
    return validTLDRegex.test(domain);
  } else {
    const validDomainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
    return validDomainRegex.test(domain);
  }
}

// Clean up domain list by keeping only base domains (removes redundant subdomains)
function cleanupDomainList(domains) {
  const baseDomains = new Set();
  for (const domain of domains) {
    const base = getBaseDomain(domain);
    baseDomains.add(base);
  }
  return Array.from(baseDomains);
}

// Update domain list in storage
async function updateDomainList() {
  const domains = await loadLocalDomainList();
  
  if (domains.length > 0) {
    console.log(`Loaded ${domains.length} domains from local file`);
    
    // Get permanent domains
    const result = await chrome.storage.local.get([STORAGE_KEYS.PERMANENT_DOMAINS]);
    const permanentDomains = result[STORAGE_KEYS.PERMANENT_DOMAINS] || [];
    console.log(`Loaded ${permanentDomains.length} permanent domains`);
    
    // Combine domains from file with permanent domains
    const combinedDomains = [...new Set([...domains, ...permanentDomains])];
    
    // Clean up: keep only base domains to save storage space
    // PAC script will automatically handle subdomains
    const cleanedDomains = cleanupDomainList(combinedDomains);
    console.log(`Cleaned to ${cleanedDomains.length} base domains (from ${combinedDomains.length} total)`);
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.DOMAIN_LIST]: cleanedDomains,
      [STORAGE_KEYS.SELECTED_LIST]: LIST_TYPES.LOCAL_FILE,
      [STORAGE_KEYS.LAST_UPDATE]: Date.now()
    });
    
    return cleanedDomains;
  } else {
    console.warn('No domains found in the local file');
    
    // Try to get existing domains from storage rather than returning empty
    const { domains: existingDomains } = await getStoredDomainList();
    if (existingDomains && existingDomains.length > 0) {
      // Clean up existing domains too
      const cleaned = cleanupDomainList(existingDomains);
      console.log(`Cleaned existing domains: ${existingDomains.length} -> ${cleaned.length}`);
      await chrome.storage.local.set({
        [STORAGE_KEYS.DOMAIN_LIST]: cleaned,
        [STORAGE_KEYS.LAST_UPDATE]: Date.now()
      });
      return cleaned;
    }
    
    // Return at least critical domains as fallback
    return ['chatgpt.com', 'openai.com', 'x.com', 'twitter.com'];
  }
}

// Get stored domain list
async function getStoredDomainList() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.DOMAIN_LIST, 
    STORAGE_KEYS.SELECTED_LIST, 
    STORAGE_KEYS.LAST_UPDATE
  ]);
  
  return {
    domains: result[STORAGE_KEYS.DOMAIN_LIST] || [],
    listType: result[STORAGE_KEYS.SELECTED_LIST] || LIST_TYPES.LOCAL_FILE,
    lastUpdate: result[STORAGE_KEYS.LAST_UPDATE] || 0
  };
}

// Check if domain matches any pattern in the list
function isDomainInList(domain, domainList) {
  if (!domain || !domainList || !Array.isArray(domainList) || domainList.length === 0) {
    return false;
  }
  
  // Convert domain to lowercase for case-insensitive matching
  const lowerDomain = domain.toLowerCase();
  
  // Check for TLD matches (entries starting with dot)
  for (const entry of domainList) {
    if (entry.startsWith('.') && lowerDomain.endsWith(entry)) {
      return true;
    }
  }
  
  // Direct match
  if (domainList.includes(lowerDomain)) {
    return true;
  }
  
  // Check for subdomain matches
  // Example: test.example.com should match example.com pattern
  const domainParts = lowerDomain.split('.');
  
  for (let i = 1; i < domainParts.length; i++) {
    const parentDomain = domainParts.slice(i).join('.');
    if (domainList.includes(parentDomain)) {
      return true;
    }
  }
  
  return false;
}

// Add a new domain to the list
async function addDomainToList(domain) {
  if (!isValidDomain(domain)) {
    throw new Error('Invalid domain format');
  }
  
  try {
    // Get current domain list and clean it first
    const { domains } = await getStoredDomainList();
    const cleanedDomains = cleanupDomainList(domains);
    
    // Get permanent domain list and clean it too
    const result = await chrome.storage.local.get([STORAGE_KEYS.PERMANENT_DOMAINS]);
    let permanentDomains = result[STORAGE_KEYS.PERMANENT_DOMAINS] || [];
    permanentDomains = cleanupDomainList(permanentDomains);
    
    // Extract base domain (e.g., www.example.com -> example.com)
    const lowercaseDomain = domain.toLowerCase();
    const baseDomain = getBaseDomain(lowercaseDomain);
    
    // Check if base domain already exists (check by base domain, not exact match)
    const baseExists = cleanedDomains.some(d => getBaseDomain(d) === baseDomain);
    if (baseExists) {
      console.log(`Domain ${domain} (base: ${baseDomain}) already in the list`);
      return { success: true, alreadyExists: true };
    }
    
    // Add only the base domain, not all subdomains
    // PAC script already handles subdomain matching automatically
    const updatedDomains = [...cleanedDomains, baseDomain];
    
    // Add to permanent list if not already there
    const permanentBaseExists = permanentDomains.some(d => getBaseDomain(d) === baseDomain);
    if (!permanentBaseExists) {
      permanentDomains.push(baseDomain);
    }
    
    // For known domain families, add critical external domains (like Twitch CDN)
    const explicit = DOMAIN_DEPENDENCIES[baseDomain];
    if (explicit) {
      for (const extra of explicit) {
        // Only add external domains (different base), not subdomains
        const extraBase = getBaseDomain(extra);
        if (extraBase !== baseDomain) {
          const extraExists = updatedDomains.some(d => getBaseDomain(d) === extraBase);
          if (!extraExists) {
            updatedDomains.push(extraBase);
          }
          const permanentExtraExists = permanentDomains.some(d => getBaseDomain(d) === extraBase);
          if (!permanentExtraExists) {
            permanentDomains.push(extraBase);
          }
        }
      }
    }
    
    // Final cleanup to remove any duplicates
    const finalDomains = cleanupDomainList(updatedDomains);
    const finalPermanentDomains = cleanupDomainList(permanentDomains);
    
    // Save updated lists
    await chrome.storage.local.set({
      [STORAGE_KEYS.DOMAIN_LIST]: finalDomains,
      [STORAGE_KEYS.PERMANENT_DOMAINS]: finalPermanentDomains,
      [STORAGE_KEYS.LAST_UPDATE]: Date.now()
    });
    
    console.log(`Added domain ${domain} (base: ${baseDomain}) to the list. New count: ${finalDomains.length}`);
    console.log(`Permanent domains count: ${finalPermanentDomains.length}`);
    return { success: true, alreadyExists: false };
  } catch (error) {
    console.error('Error adding domain to list:', error);
    throw error;
  }
}

// Remove a domain from the list
async function removeDomainFromList(domain) {
  if (!isValidDomain(domain)) {
    throw new Error('Invalid domain format');
  }
  
  try {
    // Get current domain list and clean it first
    const { domains } = await getStoredDomainList();
    const cleanedDomains = cleanupDomainList(domains);
    
    // Get permanent domain list and clean it too
    const result = await chrome.storage.local.get([STORAGE_KEYS.PERMANENT_DOMAINS]);
    let permanentDomains = result[STORAGE_KEYS.PERMANENT_DOMAINS] || [];
    permanentDomains = cleanupDomainList(permanentDomains);
    
    // Extract base domain
    const lowercaseDomain = domain.toLowerCase();
    const baseDomain = getBaseDomain(lowercaseDomain);
    
    // Check if base domain exists (check by base domain, not exact match)
    const baseExists = cleanedDomains.some(d => getBaseDomain(d) === baseDomain);
    if (!baseExists) {
      console.log(`Domain ${domain} (base: ${baseDomain}) not found in the list`);
      return { success: false, notFound: true };
    }
    
    // For known domain families, collect all related external domains to remove
    const explicit = DOMAIN_DEPENDENCIES[baseDomain];
    const domainsToRemove = new Set([baseDomain]);
    if (explicit) {
      for (const extra of explicit) {
        const extraBase = getBaseDomain(extra);
        domainsToRemove.add(extraBase);
        console.log(`Will remove related domain: ${extraBase} (for ${baseDomain})`);
      }
    }
    
    // Remove all domains that match any base domain in domainsToRemove
    const updatedDomains = cleanedDomains.filter(d => {
      const dBase = getBaseDomain(d);
      const shouldRemove = domainsToRemove.has(dBase);
      if (shouldRemove) {
        console.log(`Removing domain: ${d} (base: ${dBase})`);
      }
      return !shouldRemove;
    });
    
    const updatedPermanentDomains = permanentDomains.filter(d => {
      const dBase = getBaseDomain(d);
      const shouldRemove = domainsToRemove.has(dBase);
      if (shouldRemove) {
        console.log(`Removing permanent domain: ${d} (base: ${dBase})`);
      }
      return !shouldRemove;
    });
    
    // Final cleanup to ensure no duplicates
    const finalDomains = cleanupDomainList(updatedDomains);
    const finalPermanentDomains = cleanupDomainList(updatedPermanentDomains);
    
    // Save updated lists
    await chrome.storage.local.set({
      [STORAGE_KEYS.DOMAIN_LIST]: finalDomains,
      [STORAGE_KEYS.PERMANENT_DOMAINS]: finalPermanentDomains,
      [STORAGE_KEYS.LAST_UPDATE]: Date.now()
    });
    
    console.log(`Removed domain ${domain} (base: ${baseDomain}) from the list. New count: ${finalDomains.length}`);
    console.log(`Permanent domains count: ${finalPermanentDomains.length}`);
    return { success: true, notFound: false };
  } catch (error) {
    console.error('Error removing domain from list:', error);
    throw error;
  }
}

// Export functions
export {
  LIST_TYPES,
  STORAGE_KEYS,
  updateDomainList,
  getStoredDomainList,
  isDomainInList,
  isValidDomain,
  addDomainToList,
  removeDomainFromList
};