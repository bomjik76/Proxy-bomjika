import { updateDomainList, getStoredDomainList, removeDomainFromList } from './domainLists.js';
import { initSeasonalTheme } from './seasonalTheme.js';
import {
  MAX_PROXY_SERVERS,
  getProxyServers,
  saveProxyServers,
  initializeProxyServersIfNeeded,
  generateServerId,
  applyActiveServerToStorage,
  isBlankServer,
  sanitizeProxyServers,
  normalizeProxyHost
} from './proxyServers.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initSeasonalTheme();

  const proxyEnabledToggle = document.getElementById('proxyEnabled');
  const onlyRefilterDomainsToggle = document.getElementById('onlyRefilterDomains');
  const proxyProfileSelect = document.getElementById('proxyProfileSelect');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const serverTabs = document.getElementById('serverTabs');
  const serverLabelInput = document.getElementById('serverLabel');
  const serverHostInput = document.getElementById('serverHost');
  const serverPortInput = document.getElementById('serverPort');
  const serverUsernameInput = document.getElementById('serverUsername');
  const serverPasswordInput = document.getElementById('serverPassword');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const togglePasswordIcon = document.getElementById('togglePasswordIcon');
  const addServerBtn = document.getElementById('addServerBtn');
  const deleteServerBtn = document.getElementById('deleteServerBtn');
  const copyServersBtn = document.getElementById('copyServersBtn');
  const pasteServersBtn = document.getElementById('pasteServersBtn');
  const saveServersBtn = document.getElementById('saveServersBtn');
  const settingsStatus = document.getElementById('settingsStatus');

  let draftServers = [];
  let editingServerIndex = 0;
  const domainListSection = document.getElementById('domainListSection');
  const refreshDomainListBtn = document.getElementById('refreshDomainList');
  const domainCountElement = document.getElementById('domainCount');
  const lastUpdateElement = document.getElementById('lastUpdate');
  const statusElement = document.getElementById('status');
  const addCurrentSiteBtn = document.getElementById('addCurrentSiteBtn');
  const removeCurrentSiteBtn = document.getElementById('removeCurrentSiteBtn');
  const addSiteStatus = document.getElementById('addSiteStatus');

  await initializeProxyServersIfNeeded();

  const settings = await chrome.storage.local.get([
    'proxyEnabled',
    'onlyRefilterDomains',
    'activeProxyId'
  ]);

  proxyEnabledToggle.checked = settings.proxyEnabled || false;
  onlyRefilterDomainsToggle.checked = settings.onlyRefilterDomains || false;
  updateStatus(settings.proxyEnabled);

  await refreshProxyProfileSelect(settings.activeProxyId);

  // Показать/скрыть секцию доменов в зависимости от настроек
  if (settings.onlyRefilterDomains) {
    domainListSection.classList.remove('hidden');
    await loadDomainListInfo();
  } else {
    domainListSection.classList.add('hidden');
  }

  // Анимация при наведении для улучшения UX
  const allToggleCards = document.querySelectorAll('.card');
  allToggleCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
    });
  });

  // Обработчик изменения статуса прокси
  proxyEnabledToggle.addEventListener('change', async () => {
    // Добавляем анимацию к кнопке при переключении
    const toggleParent = proxyEnabledToggle.closest('.toggle');
    toggleParent.style.backgroundColor = proxyEnabledToggle.checked ? 
      'rgba(74, 144, 226, 0.15)' : 'transparent';
    
    // Сохраняем настройки
    await chrome.storage.local.set({ proxyEnabled: proxyEnabledToggle.checked });
    updateStatus(proxyEnabledToggle.checked);
    
    // Отправляем сообщение в background скрипт
    chrome.runtime.sendMessage({ 
      action: 'updateProxySettings',
      proxyEnabled: proxyEnabledToggle.checked
    });
    
    // Показываем анимацию пульсации на статусе
    statusElement.classList.add('pulse');
    setTimeout(() => statusElement.classList.remove('pulse'), 1500);
  });

  // Обработчик изменения режима доменов
  onlyRefilterDomainsToggle.addEventListener('change', async () => {
    // Визуальный отклик
    const toggleParent = onlyRefilterDomainsToggle.closest('.toggle');
    toggleParent.style.backgroundColor = onlyRefilterDomainsToggle.checked ? 
      'rgba(74, 144, 226, 0.15)' : 'transparent';
    
    // Сохраняем настройки
    await chrome.storage.local.set({ onlyRefilterDomains: onlyRefilterDomainsToggle.checked });
    
    // Показываем/скрываем секцию доменов с анимацией
    if (onlyRefilterDomainsToggle.checked) {
      domainListSection.classList.remove('hidden');
      domainListSection.style.opacity = '0';
      setTimeout(() => {
        domainListSection.style.opacity = '1';
        domainListSection.style.transition = 'opacity 0.3s ease';
      }, 50);
      await loadDomainListInfo();
    } else {
      domainListSection.style.opacity = '0';
      domainListSection.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        domainListSection.classList.add('hidden');
      }, 300);
    }
    
    // Отправляем сообщение в background скрипт
    chrome.runtime.sendMessage({ 
      action: 'updateProxySettings',
      onlyRefilterDomains: onlyRefilterDomainsToggle.checked
    });
  });
  
  if (proxyProfileSelect) {
    proxyProfileSelect.addEventListener('change', async () => {
      const selectedId = proxyProfileSelect.value;
      await applyActiveServerToStorage(selectedId);
      chrome.runtime.sendMessage({
        action: 'updateProxySettings',
        activeProxyId: selectedId
      });
    });
  }

  openSettingsBtn.addEventListener('click', async () => {
    draftServers = await getProxyServers();
    const { activeProxyId } = await chrome.storage.local.get('activeProxyId');
    const idx = draftServers.findIndex(s => s.id === activeProxyId);
    editingServerIndex = idx >= 0 ? idx : 0;
    renderServerTabs();
    loadServerFormFromDraft();
    updateSettingsButtonsState();
    settingsStatus.textContent = '';
    settingsStatus.className = 'settings-status';
    document.body.classList.add('settings-open');
    settingsPanel.classList.remove('hidden');
  });

  function closeSettingsPanel() {
    settingsPanel.classList.add('hidden');
    document.body.classList.remove('settings-open');
  }

  closeSettingsBtn.addEventListener('click', closeSettingsPanel);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !settingsPanel.classList.contains('hidden')) {
      closeSettingsPanel();
    }
  });

  serverLabelInput.addEventListener('input', syncFormToDraft);
  serverHostInput.addEventListener('input', syncFormToDraft);
  serverPortInput.addEventListener('input', syncFormToDraft);
  serverUsernameInput.addEventListener('input', syncFormToDraft);
  serverPasswordInput.addEventListener('input', syncFormToDraft);

  function resetPasswordVisibility() {
    serverPasswordInput.type = 'password';
    togglePasswordIcon.textContent = 'visibility';
    togglePasswordBtn.title = 'Показать пароль';
    togglePasswordBtn.setAttribute('aria-label', 'Показать пароль');
  }

  togglePasswordBtn.addEventListener('click', () => {
    const show = serverPasswordInput.type === 'password';
    serverPasswordInput.type = show ? 'text' : 'password';
    togglePasswordIcon.textContent = show ? 'visibility_off' : 'visibility';
    togglePasswordBtn.title = show ? 'Скрыть пароль' : 'Показать пароль';
    togglePasswordBtn.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
  });

  function fallbackCopyText(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-10000px';
      ta.style.top = '-10000px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  async function tryClipboardReadText() {
    // navigator.clipboard.readText может быть недоступен в некоторых окружениях,
    // поэтому делаем безопасный fallback через prompt.
    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      return await navigator.clipboard.readText();
    }
    return null;
  }

  if (copyServersBtn) {
    copyServersBtn.addEventListener('click', async () => {
      syncFormToDraft();
      const payload = {
        format: 'proxyServers',
        version: 1,
        servers: draftServers
      };
      const text = JSON.stringify(payload, null, 2);
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(text);
        } else {
          const ok = fallbackCopyText(text);
          if (!ok) throw new Error('Не удалось скопировать в буфер');
        }
        showSettingsStatus('Серверы скопированы в буфер обмена', 'success');
      } catch (e) {
        const ok = fallbackCopyText(text);
        if (!ok) {
          showSettingsStatus('Скопировать не удалось. Скопируйте JSON вручную.', 'error');
          // eslint-disable-next-line no-alert
          window.prompt('Скопируйте JSON серверов:', text);
          return;
        }
        showSettingsStatus('Серверы скопированы (fallback)', 'success');
      }
    });
  }

  if (pasteServersBtn) {
    pasteServersBtn.addEventListener('click', async () => {
      pasteServersBtn.disabled = true;
      try {
        let text = null;
        try {
          text = await tryClipboardReadText();
        } catch (e) {
          text = null;
        }

        if (!text) {
          // eslint-disable-next-line no-alert
          text = window.prompt('Вставьте JSON серверов из буфера обмена:');
        }

        if (!text || !text.trim()) {
          showSettingsStatus('Буфер обмена пуст', 'error');
          return;
        }

        const parsed = JSON.parse(text);
        const serversRaw = Array.isArray(parsed) ? parsed : parsed?.servers;
        if (!Array.isArray(serversRaw)) {
          throw new Error('Неверный формат JSON');
        }

        draftServers = sanitizeProxyServers(serversRaw).slice(0, MAX_PROXY_SERVERS);
        if (!draftServers || draftServers.length === 0) {
          throw new Error('Пустой список серверов');
        }

        editingServerIndex = 0;
        renderServerTabs();
        loadServerFormFromDraft();
        updateSettingsButtonsState();
        showSettingsStatus('Серверы вставлены. Нажмите «Сохранить»', 'success');
      } catch (e) {
        console.error('Error pasting servers:', e);
        showSettingsStatus('Ошибка вставки: ' + (e?.message || 'неизвестно'), 'error');
      } finally {
        pasteServersBtn.disabled = false;
      }
    });
  }

  addServerBtn.addEventListener('click', () => {
    if (draftServers.length >= MAX_PROXY_SERVERS) {
      showSettingsStatus(`Максимум ${MAX_PROXY_SERVERS} серверов`, 'error');
      return;
    }
    syncFormToDraft();
    const n = draftServers.length + 1;
    draftServers.push({
      id: generateServerId(),
      label: `Сервер ${n}`,
      host: '',
      port: '8080',
      username: '',
      password: ''
    });
    editingServerIndex = draftServers.length - 1;
    renderServerTabs();
    loadServerFormFromDraft();
    updateSettingsButtonsState();
    showSettingsStatus('Новый сервер добавлен — заполните данные', 'success');
  });

  deleteServerBtn.addEventListener('click', async () => {
    if (draftServers.length <= 1) {
      showSettingsStatus('Нельзя удалить последний сервер', 'error');
      return;
    }
    syncFormToDraft();
    const removedId = draftServers[editingServerIndex].id;
    draftServers.splice(editingServerIndex, 1);
    if (editingServerIndex >= draftServers.length) {
      editingServerIndex = draftServers.length - 1;
    }
    renderServerTabs();
    loadServerFormFromDraft();
    updateSettingsButtonsState();

    const { activeProxyId } = await chrome.storage.local.get('activeProxyId');
    if (activeProxyId === removedId) {
      await applyActiveServerToStorage(draftServers[0].id);
      chrome.runtime.sendMessage({
        action: 'updateProxySettings',
        activeProxyId: draftServers[0].id
      });
      await refreshProxyProfileSelect(draftServers[0].id);
    }
    showSettingsStatus('Сервер удалён. Нажмите «Сохранить» для записи', 'success');
  });

  saveServersBtn.addEventListener('click', async () => {
    syncFormToDraft();
    const validationError = validateDraftServers();
    if (validationError) {
      showSettingsStatus(validationError, 'error');
      return;
    }

    saveServersBtn.disabled = true;
    try {
      const saved = await saveProxyServers(draftServers);
      draftServers = saved;
      if (editingServerIndex >= draftServers.length) {
        editingServerIndex = Math.max(0, draftServers.length - 1);
      }
      renderServerTabs();
      loadServerFormFromDraft();

      const { activeProxyId } = await chrome.storage.local.get('activeProxyId');
      let nextActiveId = activeProxyId;
      if (!saved.find(s => s.id === activeProxyId)) {
        nextActiveId = saved[0].id;
      }
      await applyActiveServerToStorage(nextActiveId);
      await refreshProxyProfileSelect(nextActiveId);

      chrome.runtime.sendMessage({
        action: 'updateProxySettings',
        activeProxyId: nextActiveId,
        proxyServersUpdated: true
      });

      showSettingsStatus('Настройки сохранены', 'success');
    } catch (error) {
      console.error('Error saving servers:', error);
      showSettingsStatus('Ошибка сохранения: ' + error.message, 'error');
    } finally {
      saveServersBtn.disabled = false;
    }
  });

  function syncFormToDraft() {
    const server = draftServers[editingServerIndex];
    if (!server) return;
    server.label = serverLabelInput.value.trim() || `Сервер ${editingServerIndex + 1}`;
    server.host = normalizeProxyHost(serverHostInput.value);
    server.port = serverPortInput.value.trim();
    server.username = serverUsernameInput.value;
    server.password = serverPasswordInput.value;
    renderServerTabs();
  }

  function loadServerFormFromDraft() {
    const server = draftServers[editingServerIndex];
    if (!server) return;
    serverLabelInput.value = server.label || '';
    serverHostInput.value = server.host || '';
    serverPortInput.value = server.port || '';
    serverUsernameInput.value = server.username || '';
    serverPasswordInput.value = server.password || '';
    resetPasswordVisibility();
  }

  function renderServerTabs() {
    serverTabs.innerHTML = '';
    draftServers.forEach((server, index) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'server-tab' + (index === editingServerIndex ? ' active' : '');
      tab.textContent = server.label || `Сервер ${index + 1}`;
      tab.title = server.host ? `${server.host}:${server.port}` : 'Не настроен';
      tab.addEventListener('click', () => {
        syncFormToDraft();
        editingServerIndex = index;
        renderServerTabs();
        loadServerFormFromDraft();
        updateSettingsButtonsState();
      });
      serverTabs.appendChild(tab);
    });
  }

  function updateSettingsButtonsState() {
    addServerBtn.disabled = draftServers.length >= MAX_PROXY_SERVERS;
    deleteServerBtn.disabled = draftServers.length <= 1;
  }

  function validateDraftServers() {
    let hasFilledServer = false;

    for (let i = 0; i < draftServers.length; i++) {
      const s = draftServers[i];
      if (isBlankServer(s)) {
        continue;
      }
      hasFilledServer = true;
      const name = s.label || `Сервер ${i + 1}`;
      if (!s.host || !s.host.trim()) {
        editingServerIndex = i;
        renderServerTabs();
        loadServerFormFromDraft();
        return `${name}: укажите IP или хост`;
      }
      if (!s.port || !/^\d+$/.test(String(s.port).trim())) {
        editingServerIndex = i;
        renderServerTabs();
        loadServerFormFromDraft();
        return `${name}: укажите корректный порт`;
      }
      s.port = String(s.port).trim();
    }

    if (!hasFilledServer) {
      const i = editingServerIndex;
      const s = draftServers[i];
      if (!s) return 'Добавьте хотя бы один сервер';
      const name = s.label || `Сервер ${i + 1}`;
      if (!s.host || !s.host.trim()) {
        return `${name}: укажите IP или хост`;
      }
      if (!s.port || !/^\d+$/.test(String(s.port).trim())) {
        return `${name}: укажите корректный порт`;
      }
      s.port = String(s.port).trim();
    }

    return null;
  }

  function showSettingsStatus(text, type) {
    settingsStatus.textContent = text;
    settingsStatus.className = 'settings-status' + (type ? ' ' + type : '');
  }

  async function refreshProxyProfileSelect(activeId) {
    if (!proxyProfileSelect) return;
    const servers = await getProxyServers();
    const currentId = activeId || proxyProfileSelect.value || servers[0]?.id;
    proxyProfileSelect.innerHTML = '';
    servers.forEach(server => {
      const option = document.createElement('option');
      option.value = server.id;
      option.textContent = server.label || server.host;
      proxyProfileSelect.appendChild(option);
    });
    if (servers.length > 0) {
      const exists = servers.some(s => s.id === currentId);
      proxyProfileSelect.value = exists ? currentId : servers[0].id;
    }
  }

  // Обработчик обновления списка доменов
  refreshDomainListBtn.addEventListener('click', async () => {
    refreshDomainListBtn.disabled = true;
    
    // Показываем анимацию обновления
    const originalText = refreshDomainListBtn.innerHTML;
    refreshDomainListBtn.innerHTML = '<span class="material-icons-round" style="animation: spin 1s linear infinite;">sync</span><span>Обновление...</span>';
    refreshDomainListBtn.style.opacity = '0.7';
    
    try {
      await updateDomainList();
      await loadDomainListInfo();
      chrome.runtime.sendMessage({ action: 'updateProxySettings' });
      
      // Показываем индикатор успеха
      refreshDomainListBtn.innerHTML = '<span class="material-icons-round">check_circle</span><span>Готово!</span>';
      refreshDomainListBtn.style.background = 'linear-gradient(135deg, #27AE60 0%, #2ECC71 100%)';
      
      // Добавляем анимацию к счетчику доменов
      domainCountElement.classList.add('pulse');
      setTimeout(() => domainCountElement.classList.remove('pulse'), 1500);
      
    } catch (error) {
      console.error('Error refreshing domain list:', error);
      refreshDomainListBtn.innerHTML = '<span class="material-icons-round">error</span><span>Ошибка</span>';
      refreshDomainListBtn.style.background = 'linear-gradient(135deg, #E74C3C 0%, #F56565 100%)';
    } finally {
      setTimeout(() => {
        refreshDomainListBtn.disabled = false;
        refreshDomainListBtn.innerHTML = originalText;
        refreshDomainListBtn.style.opacity = '1';
        refreshDomainListBtn.style.backgroundColor = '';
      }, 2000);
    }
  });

  // Обработчик добавления текущего сайта
  addCurrentSiteBtn.addEventListener('click', async () => {
    addCurrentSiteBtn.disabled = true;
    removeCurrentSiteBtn.disabled = true;
    addSiteStatus.textContent = 'Сбор доменов вкладки...';
    addSiteStatus.className = 'notification-status';
    
    try {
      // Получаем активную вкладку для определения текущего URL
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        throw new Error('Не удалось получить информацию о текущей вкладке');
      }
      
      const currentTab = tabs[0];
      const url = new URL(currentTab.url);
      const domain = url.hostname;
      
      if (!domain) {
        throw new Error('Не удалось определить домен текущего сайта');
      }
      
      // Добавляем домены только по типам main_frame/xmlhttprequest/fetch
      const response = await chrome.runtime.sendMessage({ 
        action: 'addTrackedTabDomains',
        tabId: currentTab.id,
        fallbackDomain: domain
      });
      
      if (response && response.success) {
        const added = response.addedCount || 0;
        const existing = response.existingCount || 0;
        const failed = response.failedCount || 0;
        const processed = response.processedCount || 0;

        if (added > 0) {
          addSiteStatus.textContent = `Добавлено доменов: ${added} из ${processed}`;
          addSiteStatus.className = 'notification-status success';
          await loadDomainListInfo();
          domainCountElement.classList.add('pulse');
          setTimeout(() => domainCountElement.classList.remove('pulse'), 1500);
        } else if (existing > 0 && failed === 0) {
          addSiteStatus.textContent = 'Все найденные домены уже есть в списке';
          addSiteStatus.className = 'notification-status success';
        } else {
          addSiteStatus.textContent = `Не удалось добавить домены (ошибок: ${failed})`;
          addSiteStatus.className = 'notification-status error';
        }
      } else {
        addSiteStatus.textContent = 'Ошибка: ' + (response?.error || 'Неизвестная ошибка');
        addSiteStatus.className = 'notification-status error';
      }
    } catch (error) {
      console.error('Error adding current site:', error);
      addSiteStatus.textContent = 'Ошибка: ' + error.message;
      addSiteStatus.className = 'notification-status error';
    } finally {
      setTimeout(() => {
        addCurrentSiteBtn.disabled = false;
        removeCurrentSiteBtn.disabled = false;
      }, 2000);
    }
  });

  // Обработчик удаления текущего сайта
  removeCurrentSiteBtn.addEventListener('click', async () => {
    removeCurrentSiteBtn.disabled = true;
    addCurrentSiteBtn.disabled = true;
    addSiteStatus.textContent = 'Получение текущего сайта...';
    addSiteStatus.className = 'notification-status';
    
    try {
      // Получаем активную вкладку для определения текущего URL
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        throw new Error('Не удалось получить информацию о текущей вкладке');
      }
      
      const currentTab = tabs[0];
      const url = new URL(currentTab.url);
      const domain = url.hostname;
      
      if (!domain) {
        throw new Error('Не удалось определить домен текущего сайта');
      }
      
      console.log('Отправка запроса на удаление домена:', domain);
      
      // Попробуем альтернативный способ удаления - напрямую вызовем функцию
      try {
        // Сначала пробуем удалить напрямую
        const directResult = await removeDomainFromList(domain);
        console.log('Результат прямого удаления:', directResult);
        
        if (directResult.success) {
          addSiteStatus.textContent = directResult.notFound 
            ? `Сайт ${domain} не найден в списке` 
            : `Сайт ${domain} успешно удален`;
          
          // Обновляем счетчик доменов
          await loadDomainListInfo();
          
          // Добавляем анимацию к счетчику доменов
          domainCountElement.classList.add('pulse');
          setTimeout(() => domainCountElement.classList.remove('pulse'), 1500);
          
          addSiteStatus.className = 'notification-status success';
          
          // Обновляем настройки прокси
          chrome.runtime.sendMessage({ action: 'updateProxySettings' });
          return;
        }
      } catch (directError) {
        console.error('Ошибка при прямом удалении:', directError);
      }
      
      // Если прямое удаление не сработало, используем сообщение
      const message = { 
        action: 'removeDomainFromList',
        domain: domain
      };
      console.log('Сообщение:', JSON.stringify(message));
      
      const response = await chrome.runtime.sendMessage(message);
      console.log('Получен ответ:', response);
      
      if (response && response.success) {
        if (response.notFound) {
          addSiteStatus.textContent = `Сайт ${domain} не найден в списке`;
        } else {
          addSiteStatus.textContent = `Сайт ${domain} успешно удален`;
          
          // Обновляем счетчик доменов
          await loadDomainListInfo();
          
          // Добавляем анимацию к счетчику доменов
          domainCountElement.classList.add('pulse');
          setTimeout(() => domainCountElement.classList.remove('pulse'), 1500);
        }
        addSiteStatus.className = 'notification-status success';
      } else {
        addSiteStatus.textContent = 'Ошибка: ' + (response?.error || 'Неизвестная ошибка');
        addSiteStatus.className = 'notification-status error';
      }
    } catch (error) {
      console.error('Error removing current site:', error);
      addSiteStatus.textContent = 'Ошибка: ' + error.message;
      addSiteStatus.className = 'notification-status error';
    } finally {
      setTimeout(() => {
        removeCurrentSiteBtn.disabled = false;
        addCurrentSiteBtn.disabled = false;
      }, 2000);
    }
  });

  // Обновляет статус в UI
  function updateStatus(enabled) {
    const statusText = enabled ? 'Статус: Активен' : 'Статус: Не активен';
    const statusIcon = enabled ? 'check_circle' : 'info';
    
    statusElement.innerHTML = `
      <span class="material-icons-round">${statusIcon}</span>
      <span>${statusText}</span>
    `;
    
    if (enabled) {
      statusElement.classList.remove('inactive');
      statusElement.classList.add('active');
    } else {
      statusElement.classList.remove('active');
      statusElement.classList.add('inactive');
    }
  }

  // Загружает информацию о списке доменов
  async function loadDomainListInfo() {
    try {
      const { domains, lastUpdate } = await getStoredDomainList();
      
      // Обновляем счетчик доменов
      domainCountElement.textContent = domains.length;
      
      // Обновляем время последнего обновления
      if (lastUpdate) {
        const date = new Date(lastUpdate);
        lastUpdateElement.textContent = date.toLocaleString();
      } else {
        lastUpdateElement.textContent = 'Никогда';
      }
    } catch (error) {
      console.error('Error loading domain list info:', error);
      domainCountElement.textContent = '0';
      lastUpdateElement.textContent = 'Ошибка загрузки';
    }
  }
  
  // Добавляем стиль анимации вращения для иконки обновления
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  
}); 