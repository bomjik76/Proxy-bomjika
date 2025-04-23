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
    
    // Check if critical domains are included
    const criticalDomains = ['chatgpt.com', 'openai.com', 'x.com', 'twitter.com'];
    let domainsSet = new Set(domains);
    
    for (const domain of criticalDomains) {
      if (!domainsSet.has(domain)) {
        console.log(`Adding critical domain that was missing: ${domain}`);
        domainsSet.add(domain);
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
    console.log(`Combined total: ${combinedDomains.length} domains`);
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.DOMAIN_LIST]: combinedDomains,
      [STORAGE_KEYS.SELECTED_LIST]: LIST_TYPES.LOCAL_FILE,
      [STORAGE_KEYS.LAST_UPDATE]: Date.now()
    });
    
    return combinedDomains;
  } else {
    console.warn('No domains found in the local file');
    
    // Try to get existing domains from storage rather than returning empty
    const { domains: existingDomains } = await getStoredDomainList();
    if (existingDomains && existingDomains.length > 0) {
      console.log(`Keeping ${existingDomains.length} existing domains`);
      return existingDomains;
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
    // Get current domain list
    const { domains } = await getStoredDomainList();
    
    // Get permanent domain list
    const result = await chrome.storage.local.get([STORAGE_KEYS.PERMANENT_DOMAINS]);
    let permanentDomains = result[STORAGE_KEYS.PERMANENT_DOMAINS] || [];
    
    // Check if domain already exists
    const lowercaseDomain = domain.toLowerCase();
    if (domains.includes(lowercaseDomain)) {
      console.log(`Domain ${domain} already in the list`);
      return { success: true, alreadyExists: true };
    }
    
    // Add the new domain to both lists
    const updatedDomains = [...domains, lowercaseDomain];
    
    // Add to permanent list if not already there
    if (!permanentDomains.includes(lowercaseDomain)) {
      permanentDomains.push(lowercaseDomain);
    }
    
    // Save updated lists
    await chrome.storage.local.set({
      [STORAGE_KEYS.DOMAIN_LIST]: updatedDomains,
      [STORAGE_KEYS.PERMANENT_DOMAINS]: permanentDomains,
      [STORAGE_KEYS.LAST_UPDATE]: Date.now()
    });
    
    console.log(`Added domain ${domain} to the list. New count: ${updatedDomains.length}`);
    console.log(`Permanent domains count: ${permanentDomains.length}`);
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
    // Get current domain list
    const { domains } = await getStoredDomainList();
    
    // Get permanent domain list
    const result = await chrome.storage.local.get([STORAGE_KEYS.PERMANENT_DOMAINS]);
    let permanentDomains = result[STORAGE_KEYS.PERMANENT_DOMAINS] || [];
    
    // Check if domain exists
    const lowercaseDomain = domain.toLowerCase();
    if (!domains.includes(lowercaseDomain)) {
      console.log(`Domain ${domain} not found in the list`);
      return { success: false, notFound: true };
    }
    
    // Remove the domain from both lists
    const updatedDomains = domains.filter(d => d !== lowercaseDomain);
    const updatedPermanentDomains = permanentDomains.filter(d => d !== lowercaseDomain);
    
    // Save updated lists
    await chrome.storage.local.set({
      [STORAGE_KEYS.DOMAIN_LIST]: updatedDomains,
      [STORAGE_KEYS.PERMANENT_DOMAINS]: updatedPermanentDomains,
      [STORAGE_KEYS.LAST_UPDATE]: Date.now()
    });
    
    console.log(`Removed domain ${domain} from the list. New count: ${updatedDomains.length}`);
    console.log(`Permanent domains count: ${updatedPermanentDomains.length}`);
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