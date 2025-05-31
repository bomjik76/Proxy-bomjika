import { updateDomainList, getStoredDomainList, removeDomainFromList } from './domainLists.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Элементы управления
  const proxyEnabledToggle = document.getElementById('proxyEnabled');
  const onlyRefilterDomainsToggle = document.getElementById('onlyRefilterDomains');
  const domainListSection = document.getElementById('domainListSection');
  const refreshDomainListBtn = document.getElementById('refreshDomainList');
  const domainCountElement = document.getElementById('domainCount');
  const lastUpdateElement = document.getElementById('lastUpdate');
  const statusElement = document.getElementById('status');
  const addCurrentSiteBtn = document.getElementById('addCurrentSiteBtn');
  const removeCurrentSiteBtn = document.getElementById('removeCurrentSiteBtn');
  const addSiteStatus = document.getElementById('addSiteStatus');

  // Загрузка настроек
  const settings = await chrome.storage.local.get([
    'proxyEnabled',
    'onlyRefilterDomains',
    'proxyHost',
    'proxyPort',
    'proxyUsername',
    'proxyPassword'
  ]);

  // Обновление UI на основе настроек
  proxyEnabledToggle.checked = settings.proxyEnabled || false;
  onlyRefilterDomainsToggle.checked = settings.onlyRefilterDomains || false;
  updateStatus(settings.proxyEnabled);

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
      card.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
    });
  });

  // Обработчик изменения статуса прокси
  proxyEnabledToggle.addEventListener('change', async () => {
    // Добавляем анимацию к кнопке при переключении
    const toggleParent = proxyEnabledToggle.closest('.toggle');
    toggleParent.style.backgroundColor = proxyEnabledToggle.checked ? 
      'rgba(33, 150, 243, 0.2)' : 'transparent';
    
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
      'rgba(33, 150, 243, 0.2)' : 'transparent';
    
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
      refreshDomainListBtn.style.backgroundColor = 'rgba(40, 167, 69, 0.8)';
      
      // Добавляем анимацию к счетчику доменов
      domainCountElement.classList.add('pulse');
      setTimeout(() => domainCountElement.classList.remove('pulse'), 1500);
      
    } catch (error) {
      console.error('Error refreshing domain list:', error);
      refreshDomainListBtn.innerHTML = '<span class="material-icons-round">error</span><span>Ошибка</span>';
      refreshDomainListBtn.style.backgroundColor = 'rgba(220, 53, 69, 0.8)';
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
      
      // Добавляем домен в список
      const response = await chrome.runtime.sendMessage({ 
        action: 'addDomainToList',
        domain: domain
      });
      
      if (response && response.success) {
        if (response.alreadyExists) {
          addSiteStatus.textContent = `Сайт ${domain} уже в списке`;
        } else {
          addSiteStatus.textContent = `Сайт ${domain} успешно добавлен`;
          
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