let currentReport = null;

// Constantes para localStorage
const STORAGE_KEYS = {
    CURRENT_REPORT: 'robo_link_checker_current_report',
    USER_PREFERENCES: 'robo_link_checker_preferences',
    FAVORITE_SITES: 'robo_link_checker_favorite_sites',
    MONITORING_SETTINGS: 'robo_link_checker_monitoring_settings'
};

// Variáveis do sistema de monitoramento
let monitoringInterval = null;
let nextCheckTimeout = null;
let monitoringActive = false;
let isChecking = false; // Controla se uma verificação está em andamento
let activeGroupFilter = 'todos'; // Controla qual grupo está ativo
let activeSubfilter = null; // Controla qual subfiltro está ativo

// Elementos do DOM
const urlInput = document.getElementById('urlInput');
const checkButton = document.getElementById('checkButton');
const checkExternal = document.getElementById('checkExternal');
const maxLinks = document.getElementById('maxLinks');
const unlimitedWarning = document.getElementById('unlimitedWarning');
const loading = document.getElementById('loading');
const results = document.getElementById('results');
const errorMessage = document.getElementById('errorMessage');
const linkForm = document.getElementById('linkForm');

// Elementos do sistema de monitoramento
const favoriteUrlInput = document.getElementById('favoriteUrlInput');
const autoMonitoring = document.getElementById('autoMonitoring');
const favoriteSites = document.getElementById('favoriteSites');
const totalMonitored = document.getElementById('totalMonitored');
const nextCheck = document.getElementById('nextCheck');

// Funções de Notificação
async function requestNotificationPermission() {
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }
    return false;
}

function showNotification(title, options = {}) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            ...options
        });

        // Auto-fechar após 5 segundos
        setTimeout(() => {
            notification.close();
        }, 5000);

        return notification;
    }
}

function showSuccessNotification(url, stats) {
    const message = `✅ ${stats.totalLinks} links verificados - Todos OK!`;
    showNotification(`Verificação Concluída`, {
        body: `${url}\n${message}`,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="green"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
        tag: 'verification-success'
    });
}

function showErrorNotification(url, stats) {
    const message = `❌ ${stats.brokenLinks} links quebrados de ${stats.totalLinks} total`;
    showNotification(`Problemas Encontrados!`, {
        body: `${url}\n${message}`,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="red"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
        tag: 'verification-error'
    });
}

// Funções de Persistência
function saveCurrentReport(report) {
    try {
        // Salvar relatório atual
        localStorage.setItem(STORAGE_KEYS.CURRENT_REPORT, JSON.stringify(report));

        console.log('📁 Relatório salvo com sucesso!');
    } catch (error) {
        console.warn('⚠️ Erro ao salvar relatório:', error);
    }
}

function loadCurrentReport() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_REPORT);
        if (saved) {
            const report = JSON.parse(saved);
            console.log('📂 Relatório carregado:', report.url);
            return report;
        }
    } catch (error) {
        console.warn('⚠️ Erro ao carregar relatório:', error);
    }
    return null;
}

function saveUserPreferences() {
    try {
        const preferences = {
            checkExternal: checkExternal.checked,
            maxLinks: maxLinks.value,
            lastUrl: urlInput.value
        };
        localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(preferences));
    } catch (error) {
        console.warn('⚠️ Erro ao salvar preferências:', error);
    }
}

function loadUserPreferences() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
        if (saved) {
            const preferences = JSON.parse(saved);

            if (preferences.checkExternal !== undefined) {
                checkExternal.checked = preferences.checkExternal;
            }
            if (preferences.maxLinks) {
                maxLinks.value = preferences.maxLinks;
                toggleUnlimitedWarning();
            }
            if (preferences.lastUrl && !urlInput.value) {
                urlInput.value = preferences.lastUrl;
            }

            console.log('⚙️ Preferências carregadas');
        }
    } catch (error) {
        console.warn('⚠️ Erro ao carregar preferências:', error);
    }
}

// Event Listeners
linkForm.addEventListener('submit', handleFormSubmit);
maxLinks.addEventListener('change', toggleUnlimitedWarning);

// Salvar preferências quando mudarem
checkExternal.addEventListener('change', saveUserPreferences);
maxLinks.addEventListener('change', saveUserPreferences);
urlInput.addEventListener('input', saveUserPreferences);

// Função para mostrar/ocultar aviso do modo ilimitado
function toggleUnlimitedWarning() {
    if (maxLinks.value === 'unlimited') {
        unlimitedWarning.style.display = 'flex';
    } else {
        unlimitedWarning.style.display = 'none';
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const url = urlInput.value.trim();
    if (!url) {
        showError('Por favor, insira uma URL válida.');
        return;
    }

    if (!isValidUrl(url)) {
        showError('URL inválida. Por favor, use o formato: https://exemplo.com');
        return;
    }

    await checkLinks(url);
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Funções para gerenciar sites favoritos
function loadFavoriteSites() {
    const favorites = JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVORITE_SITES) || '[]');

    // Resetar sites que ficaram presos no status 'checking'
    // E migrar favoritos antigos sem grupo
    favorites.forEach(fav => {
        if (fav.status === 'checking') {
            fav.status = 'pending';
        }
        // Adicionar grupo padrão se não existir
        if (!fav.group) {
            fav.group = 'todos';
        }
    });

    updateTotalMonitored(favorites);
    return favorites;
}

function saveFavoriteSites(favorites) {
    localStorage.setItem(STORAGE_KEYS.FAVORITE_SITES, JSON.stringify(favorites));
    updateTotalMonitored(favorites);
}

function addFavoriteUrl() {
    const url = favoriteUrlInput.value.trim();
    const groupSelect = document.getElementById('groupSelect');
    const subfilterSelect = document.getElementById('subfilterSelect');
    const selectedGroup = groupSelect.value || 'todos'; // Usa 'todos' se placeholder estiver selecionado
    const selectedSubfilter = subfilterSelect.value === 'todos' ? null : (subfilterSelect.value || null);

    if (!url) {
        showError('Por favor, insira uma URL válida');
        return;
    }

    if (!isValidUrl(url)) {
        showError('URL inválida. Use o formato: https://exemplo.com');
        return;
    }

    const favorites = loadFavoriteSites();

    // Verifica se a URL já existe
    if (favorites.some(fav => fav.url === url)) {
        showError('Esta URL já está na lista de favoritos');
        return;
    }

    const newFavorite = {
        id: Date.now(),
        url: url,
        group: selectedGroup,
        subfilter: selectedSubfilter,
        addedAt: new Date().toISOString(),
        lastCheck: null,
        status: 'pending',
        brokenLinks: 0,
        totalLinks: 0,
        lastReport: null
    };

    favorites.push(newFavorite);
    saveFavoriteSites(favorites);
    renderFavoriteSites(favorites);

    favoriteUrlInput.value = '';

    // Faz a primeira verificação imediatamente
    checkFavoriteSite(newFavorite.id);
}

function removeFavorite(favoriteId) {
    const favorites = loadFavoriteSites();
    const updatedFavorites = favorites.filter(fav => fav.id !== favoriteId);
    saveFavoriteSites(updatedFavorites);
    renderFavoriteSites(updatedFavorites);
}

function checkFavoriteSite(favoriteId) {
    const favorites = loadFavoriteSites();
    const favorite = favorites.find(fav => fav.id === favoriteId);

    if (!favorite) return;

    // Atualiza status para "checking"
    favorite.status = 'checking';
    saveFavoriteSites(favorites);
    renderFavoriteSites(favorites);

    // Timeout de segurança para evitar travamento
    const timeoutId = setTimeout(() => {
        const currentFavorites = loadFavoriteSites();
        const currentFavorite = currentFavorites.find(fav => fav.id === favoriteId);
        if (currentFavorite && currentFavorite.status === 'checking') {
            currentFavorite.status = 'error';
            currentFavorite.lastCheck = new Date().toISOString();

            // Criar relatório de timeout
            const timeoutReport = {
                url: currentFavorite.url,
                totalLinksFound: 0,
                brokenLinks: 0,
                workingLinks: 0,
                links: [],
                error: 'Timeout na verificação (30 segundos excedidos)',
                timestamp: new Date().toISOString()
            };

            currentFavorite.lastReport = timeoutReport;

            saveFavoriteSites(currentFavorites);
            renderFavoriteSites(currentFavorites);

            // Expandir automaticamente o card mesmo em caso de timeout
            setTimeout(() => {
                const favoriteCard = document.getElementById(`details-${favoriteId}`);
                if (favoriteCard) {
                    favoriteCard.style.display = 'block';
                    favoriteCard.innerHTML = renderFavoriteReport(timeoutReport);
                    console.log('📖 Card expandido automaticamente para mostrar relatório de timeout');
                }
            }, 200);

            console.warn('Verificação de site favorito cancelada por timeout');
        }
    }, 30000); // 30 segundos

    // Faz a verificação usando a função existente
    checkLinks(favorite.url, true, 'unlimited', false)
        .then(report => {
            clearTimeout(timeoutId);
            console.log('✅ Verificação concluída para:', favorite.url, 'Report:', report);

            // Recarregar favoritos para garantir sincronização
            const updatedFavorites = loadFavoriteSites();
            const updatedFavorite = updatedFavorites.find(fav => fav.id === favoriteId);

            if (updatedFavorite) {
                console.log('📝 Atualizando favorito:', updatedFavorite.url);
                // Atualiza os dados do favorito
                updatedFavorite.lastCheck = new Date().toISOString();
                updatedFavorite.status = report.brokenLinks > 0 ? 'error' : 'success';
                updatedFavorite.brokenLinks = report.brokenLinks;
                updatedFavorite.totalLinks = report.totalLinksFound;
                updatedFavorite.lastReport = report;

                saveFavoriteSites(updatedFavorites);
                renderFavoriteSites(updatedFavorites);
                console.log('💾 Favorito salvo com sucesso');

                // Forçar atualização visual e mostrar relatório na área principal
                setTimeout(() => {
                    const latestFavorites = loadFavoriteSites();
                    renderFavoriteSites(latestFavorites);

                    // Mostrar relatório na área principal
                    setTimeout(() => {
                        currentReport = report;
                        saveCurrentReport(report);
                        showResults(report);
                        console.log('📊 Relatório mostrado na área principal');
                    }, 200);
                }, 100);
            } else {
                console.error('❌ Favorito não encontrado ao tentar salvar resultado');
            }
        })
        .catch(error => {
            clearTimeout(timeoutId);

            // Recarregar favoritos para garantir sincronização
            const updatedFavorites = loadFavoriteSites();
            const updatedFavorite = updatedFavorites.find(fav => fav.id === favoriteId);

            if (updatedFavorite) {
                updatedFavorite.status = 'error';
                updatedFavorite.lastCheck = new Date().toISOString();

                // Criar um relatório de erro básico
                const errorReport = {
                    url: updatedFavorite.url,
                    totalLinksFound: 0,
                    brokenLinks: 0,
                    workingLinks: 0,
                    links: [],
                    error: error.message || 'Erro ao verificar o site',
                    timestamp: new Date().toISOString()
                };

                updatedFavorite.lastReport = errorReport;

                saveFavoriteSites(updatedFavorites);
                renderFavoriteSites(updatedFavorites);

                // Forçar atualização visual e mostrar relatório de erro na área principal
                setTimeout(() => {
                    const latestFavorites = loadFavoriteSites();
                    renderFavoriteSites(latestFavorites);

                    // Mostrar relatório de erro na área principal
                    setTimeout(() => {
                        currentReport = errorReport;
                        saveCurrentReport(errorReport);
                        showResults(errorReport);
                        console.log('📊 Relatório de erro mostrado na área principal');
                    }, 200);
                }, 100);
            }
            console.error('Erro ao verificar site favorito:', error);
        });
}

async function checkFavoriteSiteSequential(favoriteId) {
    const favorites = loadFavoriteSites();
    const favorite = favorites.find(fav => fav.id === favoriteId);

    if (!favorite) {
        throw new Error(`Favorito com ID ${favoriteId} não encontrado`);
    }

    // Atualiza status para "checking"
    favorite.status = 'checking';
    saveFavoriteSites(favorites);
    renderFavoriteSites(favorites);

    try {
        // Faz a verificação usando a função existente
        const report = await checkLinks(favorite.url, true, 'unlimited', false);

        // Atualiza os dados do favorito
        favorite.lastCheck = new Date().toISOString();
        favorite.status = report.brokenLinks > 0 ? 'error' : 'success';
        favorite.brokenLinks = report.brokenLinks;
        favorite.totalLinks = report.totalLinksFound;
        favorite.lastReport = report;

        saveFavoriteSites(favorites);
        renderFavoriteSites(favorites);

        // Mostrar notificação do resultado
        const stats = {
            totalLinks: report.totalLinksFound,
            brokenLinks: report.brokenLinks
        };

        if (report.brokenLinks > 0) {
            showErrorNotification(favorite.url, stats);
        } else {
            showSuccessNotification(favorite.url, stats);
        }

        return report;
    } catch (error) {
        favorite.status = 'error';
        favorite.lastCheck = new Date().toISOString();

        // Criar um relatório de erro básico para que o site tenha informações
        favorite.lastReport = {
            url: favorite.url,
            totalLinksFound: 0,
            brokenLinks: 0,
            workingLinks: 0,
            links: [],
            error: error.message || 'Erro ao verificar o site',
            timestamp: new Date().toISOString()
        };

        saveFavoriteSites(favorites);
        renderFavoriteSites(favorites);
        throw error;
    }
}

function renderFavoriteSites(favorites) {
    if (!favoriteSites) {
        console.error('❌ Elemento favoriteSites não encontrado!');
        return;
    }

    favoriteSites.innerHTML = '';

    if (favorites.length === 0) {
        favoriteSites.innerHTML = '<p class="empty-state">Nenhum site favorito adicionado</p>';
        return;
    }

    // Filtrar favoritos pelo grupo ativo
    let filteredFavorites = activeGroupFilter === 'todos'
        ? favorites
        : favorites.filter(fav => fav.group === activeGroupFilter);

    // Aplicar subfiltro se ativo
    if (activeSubfilter && activeGroupFilter !== 'todos') {
        filteredFavorites = filteredFavorites.filter(fav => fav.subfilter === activeSubfilter);
    }

    if (filteredFavorites.length === 0) {
        const groupName = getGroupDisplayName(activeGroupFilter);
        const subfilterText = activeSubfilter ? ` > ${activeSubfilter.toUpperCase()}` : '';
        favoriteSites.innerHTML = `<p class="empty-state">Nenhum site encontrado em "${groupName}${subfilterText}"</p>`;
        return;
    }

    filteredFavorites.forEach(favorite => {
        const favoriteElement = createFavoriteElement(favorite);
        favoriteSites.appendChild(favoriteElement);
    });
}

// Funções de Filtro por Grupo
function filterByGroup(group) {
    activeGroupFilter = group;
    activeSubfilter = null; // Reset subfiltro ao mudar grupo

    // Atualizar abas visuais
    document.querySelectorAll('.group-tabs .tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-group="${group}"]`).classList.add('active');

    // Fechar accordion automaticamente após seleção
    closeFiltersAccordion();

    // Atualizar indicador do filtro ativo
    updateActiveFilterIndicator();

    // Mostrar/ocultar subfiltros baseado no grupo
    updateSubfiltersVisibility();

    // Re-renderizar favoritos com filtro
    const favorites = loadFavoriteSites();
    renderFavoriteSites(favorites);
}

function updateActiveFilterIndicator() {
    const filterValue = document.getElementById('activeFilterValue');
    const groupIcon = getGroupIcon(activeGroupFilter);
    const groupName = getGroupDisplayName(activeGroupFilter);

    let filterText = `<i class="${groupIcon}"></i> ${groupName}`;

    if (activeSubfilter) {
        filterText += ` > ${activeSubfilter.toUpperCase()}`;
    }

    filterValue.innerHTML = filterText;

    // Atualizar texto do botão de verificar todos
    updateCheckAllButtonText();
}

function updateCheckAllButtonText() {
    const checkAllText = document.getElementById('checkAllText');
    if (checkAllText) {
        const groupName = getGroupDisplayName(activeGroupFilter);
        let buttonText = 'Verificar Todos';

        if (activeGroupFilter !== 'todos') {
            buttonText = `Verificar ${groupName}`;
            if (activeSubfilter) {
                buttonText += ` (${activeSubfilter})`;
            }
        }

        checkAllText.textContent = buttonText;
    }
}

function updateSubfiltersVisibility() {
    const subfiltersContainer = document.getElementById('subfiltersContainer');
    const subfiltersList = document.getElementById('subfiltersList');

    if (activeGroupFilter === 'todos') {
        subfiltersContainer.style.display = 'none';
        return;
    }

    // Usar sub-filtros globais em vez de sub-filtros específicos do grupo
    if (globalSubfilters.length === 0) {
        subfiltersContainer.style.display = 'none';
        return;
    }

    subfiltersContainer.style.display = 'block';

    // Criar chips de subfiltros usando os sub-filtros globais
    subfiltersList.innerHTML = `
        <div class="subfilter-chip all ${!activeSubfilter ? 'active' : ''}" onclick="filterBySubfilter(null)">
            <i class="fas fa-globe"></i> TODOS
        </div>
        ${globalSubfilters.map(subfilter => `
            <div class="subfilter-chip ${activeSubfilter === subfilter ? 'active' : ''}" onclick="filterBySubfilter('${subfilter}')">
                <i class="fas fa-tag"></i> ${subfilter.toUpperCase()}
            </div>
        `).join('')}
    `;
}

function filterBySubfilter(subfilter) {
    activeSubfilter = subfilter;

    // Fechar accordion automaticamente após seleção de subfiltro
    closeFiltersAccordion();

    updateActiveFilterIndicator();
    updateSubfiltersVisibility();

    const favorites = loadFavoriteSites();
    renderFavoriteSites(favorites);
}

function getGroupDisplayName(group) {
    // Primeiro, verificar se é um filtro modificado
    const modifiedDefaultFilters = JSON.parse(localStorage.getItem('modifiedDefaultFilters')) || {};
    if (modifiedDefaultFilters[group]) {
        return modifiedDefaultFilters[group].name;
    }

    // Verificar se é um filtro customizado
    const customFilter = customFilters.find(f => f.id === group);
    if (customFilter) {
        return customFilter.name;
    }

    // Nomes padrão dos filtros
    const groupNames = {
        'todos': 'TODOS',
        'dpsp': 'DPSP',
        'swift': 'SWIFT'
    };

    return groupNames[group] || group.toUpperCase();
}

function getGroupIcon(group) {
    // Primeiro, verificar se é um filtro modificado
    const modifiedDefaultFilters = JSON.parse(localStorage.getItem('modifiedDefaultFilters')) || {};
    if (modifiedDefaultFilters[group]) {
        return modifiedDefaultFilters[group].icon;
    }

    // Verificar se é um filtro customizado
    const customFilter = customFilters.find(f => f.id === group);
    if (customFilter) {
        return customFilter.icon;
    }

    // Ícones padrão dos filtros
    const groupIcons = {
        'todos': 'fas fa-globe',
        'home': 'fas fa-home',
        'produtos': 'fas fa-box',
        'categorias': 'fas fa-list'
    };

    return groupIcons[group] || 'fas fa-folder';
}

// Função para toggle do accordion de filtros
function toggleFiltersAccordion() {
    const content = document.getElementById('filtersContent');
    const icon = document.getElementById('accordionIcon');

    content.classList.toggle('open');
    icon.classList.toggle('open');
}

// Função para fechar o accordion de filtros
function closeFiltersAccordion() {
    const content = document.getElementById('filtersContent');
    const icon = document.getElementById('accordionIcon');

    content.classList.remove('open');
    icon.classList.remove('open');
}

// Função para editar grupo de um favorito
function editFavoriteGroup(favoriteId) {
    const favorites = loadFavoriteSites();
    const favorite = favorites.find(fav => fav.id === favoriteId);

    if (!favorite) return;

    const currentGroup = favorite.group;
    const currentSubfilter = favorite.subfilter || '';
    // Buscar grupos do existingFiltersList
    const existingFiltersList = document.getElementById('existingFiltersList');
    let groupOptions = [];
    if (existingFiltersList) {
        // Extrair grupos do DOM
        groupOptions = Array.from(existingFiltersList.querySelectorAll('.filter-item .filter-name')).map(el => {
            return { value: el.textContent.trim().toLowerCase(), label: el.textContent.trim() };
        });
    } else {
        // Fallback para os grupos padrão
        groupOptions = [
            { value: 'dpsp', label: 'DPSP' },
            { value: 'swift', label: 'SWIFT' },
            { value: 'todos', label: 'Todos' }
        ];
    }

    // Subfiltros: se houver subfilters no filtro selecionado, usar; senão, usar globalSubfilters
    let subfilterOptions = [{ value: '', label: 'Sem subfiltro' }];
    const selectedFilter = groupOptions.find(g => g.value === currentGroup);
    if (selectedFilter && selectedFilter.subfilters && selectedFilter.subfilters.length > 0) {
        subfilterOptions = subfilterOptions.concat(selectedFilter.subfilters.map(sub => ({ value: sub, label: sub })));
    } else if (window.globalSubfilters && window.globalSubfilters.length > 0) {
        subfilterOptions = subfilterOptions.concat(window.globalSubfilters.map(sub => ({ value: sub, label: sub })));
    }

    // Criar modal de seleção
    const modalHTML = `
        <div class="modal-overlay" id="groupEditModal" onclick="closeGroupEditModal(event)">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Alterar Grupo e Subfiltro</h3>
                    <button onclick="closeGroupEditModal()" class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p><strong>Site:</strong> ${favorite.url}</p>
                    <p><strong>Grupo atual:</strong> ${getGroupDisplayName(currentGroup)} ${currentSubfilter ? `> ${currentSubfilter.toUpperCase()}` : ''}</p>
                    
                    <label for="newGroupSelect">Novo grupo:</label>
                    <select id="newGroupSelect" class="group-select-modal">
                        ${groupOptions.map(option =>
        `<option value="${option.value}" ${option.value === currentGroup ? 'selected' : ''}>${option.label}</option>`
    ).join('')}
                    </select>
                    
                    <label for="newSubfilterSelect" style="margin-top: 10px;">Subfiltro:</label>
                    <select id="newSubfilterSelect" class="group-select-modal">
                        ${subfilterOptions.map(option =>
        `<option value="${option.value}" ${option.value === currentSubfilter ? 'selected' : ''}>${option.label}</option>`
    ).join('')}
                    </select>
                </div>
                <div class="modal-footer">
                    <button onclick="closeGroupEditModal()" class="btn-cancel">Cancelar</button>
                    <button onclick="saveGroupChange(${favoriteId})" class="btn-save">Salvar</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function saveGroupChange(favoriteId) {
    const newGroup = document.getElementById('newGroupSelect').value;
    const newSubfilter = document.getElementById('newSubfilterSelect').value || null;
    const favorites = loadFavoriteSites();
    const favorite = favorites.find(fav => fav.id === favoriteId);

    if (favorite) {
        favorite.group = newGroup;
        favorite.subfilter = newSubfilter;
        saveFavoriteSites(favorites);
        renderFavoriteSites(favorites);

        // Atualizar subfiltros se necessário
        updateSubfiltersVisibility();

        closeGroupEditModal();

        // Mostrar notificação de sucesso
        const subfilterText = newSubfilter ? ` > ${newSubfilter.toUpperCase()}` : '';
        showSuccessMessage(`Grupo alterado para "${getGroupDisplayName(newGroup)}${subfilterText}" com sucesso!`);
    }
}

function closeGroupEditModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('groupEditModal');
    if (modal) {
        modal.remove();
    }
}

function showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-toast';
    successDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(successDiv);

    setTimeout(() => {
        successDiv.classList.add('show');
    }, 100);

    setTimeout(() => {
        successDiv.classList.remove('show');
        setTimeout(() => successDiv.remove(), 300);
    }, 3000);
}

// Função para atualizar opções de subfiltro baseadas nos sub-filtros globais
function updateSubfilterOptions() {
    const subfilterSelect = document.getElementById('subfilterSelect');

    if (!subfilterSelect) return;

    // Começar com a opção padrão
    let options = '<option value="" selected>Sem subfiltro</option>';

    // Adicionar sub-filtros globais (usar o nome original, não lowercase)
    globalSubfilters.forEach(subfilter => {
        options += `<option value="${subfilter}">${subfilter}</option>`;
    });

    subfilterSelect.innerHTML = options;

    // Atualizar estilo de placeholder
    updatePlaceholderStyles();
}

function updatePlaceholderStyles() {
    const groupSelect = document.getElementById('groupSelect');
    const subfilterSelect = document.getElementById('subfilterSelect');

    // Atualizar placeholder do grupo
    if (groupSelect.value === '') {
        groupSelect.setAttribute('data-placeholder', 'true');
    } else {
        groupSelect.removeAttribute('data-placeholder');
    }

    // Atualizar placeholder do subfiltro
    if (subfilterSelect.value === '') {
        subfilterSelect.setAttribute('data-placeholder', 'true');
    } else {
        subfilterSelect.removeAttribute('data-placeholder');
    }
}

function createFavoriteElement(favorite) {
    const div = document.createElement('div');
    div.className = 'favorite-item';
    div.setAttribute('data-id', favorite.id);

    console.log('🔧 Criando elemento favorito com 3 botões para:', favorite.url);

    const statusClass = getStatusClass(favorite.status);
    const statusIcon = getStatusIcon(favorite.status);
    const lastCheckText = favorite.lastCheck ?
        `Última verificação: ${formatDate(favorite.lastCheck)}` :
        'Nunca verificado';

    // Verificar se o sub-filtro ainda existe nos sub-filtros globais
    const validSubfilter = favorite.subfilter && globalSubfilters.includes(favorite.subfilter) ? favorite.subfilter : null;

    // Badge do grupo (só mostra se não estiver na aba "todos")
    const groupBadge = activeGroupFilter === 'todos' && favorite.group ?
        `<span class="group-badge" title="${getGroupDisplayName(favorite.group)}${validSubfilter ? ` > ${validSubfilter.toUpperCase()}` : ''}">
            <i class="${getGroupIcon(favorite.group)}"></i> ${getGroupDisplayName(favorite.group)}${validSubfilter ? ` > ${validSubfilter.toUpperCase()}` : ''}
        </span>` : '';

    div.innerHTML = `
        <div class="favorite-header" onclick="showFullReport(${favorite.id})">
            <div class="favorite-info">
                <i class="fas ${statusIcon} status-icon ${statusClass}"></i>
                <div class="favorite-url" title="${favorite.url}">
                    <strong>${favorite.url}</strong>
                </div>
            </div>
            <div class="favorite-meta">${lastCheckText}</div>
            ${favorite.lastCheck ? (
            favorite.brokenLinks > 0 ?
                `<div class="favorite-stats">❌ ${favorite.brokenLinks} links quebrados de ${favorite.totalLinks || 0} total</div>` :
                (favorite.totalLinks || 0) > 0 ?
                    `<div class="favorite-stats">✅ ${favorite.totalLinks} links verificados - Todos OK!</div>` :
                    `<div class="favorite-stats">✅ Verificação concluída - Nenhum link encontrado</div>`
        ) : `<div class="favorite-stats">⏳ Aguardando primeira verificação</div>`}
            <div class="favorite-actions" onclick="event.stopPropagation()">
                ${groupBadge}
                <div class="action-buttons">
                    <button onclick="editFavoriteGroup(${favorite.id})" class="btn-edit-group" title="Editar grupo" style="display: inline-flex !important;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="verificarSiteFavorito(${favorite.id})" class="btn-verificar" title="Verificar site" style="display: inline-flex !important; background: var(--card-bg); border: 1px solid var(--border-color); color: var(--text-secondary); padding: 6px 8px; border-radius: 6px; cursor: pointer; transition: all 0.2s ease;">
                        <i class="fas fa-refresh"></i>
                    </button>
                    <button onclick="removeFavorite(${favorite.id})" class="btn-remove" title="Remover" style="display: inline-flex !important;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
        <div class="favorite-expanded" id="details-${favorite.id}" style="display: none;">
            ${favorite.lastReport ? renderFavoriteReport(favorite.lastReport) : '<p>Nenhum relatório disponível</p>'}
        </div>
    `;

    console.log('✅ HTML criado com 3 botões:', div.innerHTML.includes('btn-check'));
    console.log('🔍 Verifica se contém botão check:', div.innerHTML.includes('fa-sync-alt'));

    return div;
}

function getStatusClass(status) {
    const statusMap = {
        'pending': 'status-pending',
        'checking': 'status-checking',
        'success': 'status-success',
        'error': 'status-error'
    };
    return statusMap[status] || 'status-pending';
}

function getStatusIcon(status) {
    const iconMap = {
        'pending': 'fa-clock',
        'checking': 'fa-spinner fa-spin',
        'success': 'fa-check-circle',
        'error': 'fa-exclamation-circle'
    };
    return iconMap[status] || 'fa-clock';
}

function showFullReport(favoriteId) {
    const favorites = loadFavoriteSites();
    const favorite = favorites.find(fav => fav.id === favoriteId);

    if (!favorite || !favorite.lastReport) {
        showError('Nenhum relatório disponível para este site');
        return;
    }

    // Fechar sidebar no mobile antes de mostrar o relatório
    if (window.innerWidth <= 768) {
        closeMobileSidebar();
    }

    // Limpar qualquer erro anterior
    hideError();
    hideLoading();

    // Definir como relatório atual e mostrar na área principal
    currentReport = favorite.lastReport;

    // Mostrar resultados sem salvar novamente (já está salvo no favorito)
    showResultsFromFavorite(favorite.lastReport);

    // Removido scroll automático para evitar centralização
} function toggleFavoriteDetails(favoriteId) {
    const detailsElement = document.getElementById(`details-${favoriteId}`);
    const button = document.querySelector(`[data-id="${favoriteId}"] .btn-details i`);

    if (detailsElement.style.display === 'none') {
        detailsElement.style.display = 'block';
        button.className = 'fas fa-chevron-up';
    } else {
        detailsElement.style.display = 'none';
        button.className = 'fas fa-chevron-down';
    }
}

function renderFavoriteReport(report) {
    if (!report) return '<p>Nenhum relatório disponível</p>';

    // Se há erro no relatório, mostrar informação de erro
    if (report.error) {
        return `
            <div class="report-summary">
                <div class="error-message" style="color: #dc3545; background: #f8d7da; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                    <strong>❌ Erro na verificação:</strong> ${report.error}
                </div>
                <p><strong>⏰ Última tentativa:</strong> ${report.timestamp ? formatDate(report.timestamp) : 'N/A'}</p>
                <p><em>Tente verificar novamente clicando no botão de atualização.</em></p>
            </div>
        `;
    }

    return `
        <div class="report-summary">
            <p><strong>Total de links:</strong> ${report.totalLinksFound}</p>
            <p><strong>Links válidos:</strong> ${report.workingLinks}</p>
            <p><strong>Links quebrados:</strong> ${report.brokenLinks}</p>
            ${report.timestamp ? `<p><strong>⏰ Verificado em:</strong> ${formatDate(report.timestamp)}</p>` : ''}
        </div>
    `;
}

function updateTotalMonitored(favorites = null) {
    if (!favorites) {
        favorites = JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVORITE_SITES) || '[]');
    }

    // Atualizar contador total
    totalMonitored.textContent = favorites.length;

    // Atualizar contadores nas abas
    updateGroupCounters(favorites);
}

function updateGroupCounters(favorites) {
    // Obter grupos dinâmicos atuais
    const removedDefaultFilters = JSON.parse(localStorage.getItem('removedDefaultFilters')) || [];
    const modifiedDefaultFilters = JSON.parse(localStorage.getItem('modifiedDefaultFilters')) || {};

    // Filtros padrão (exceto os removidos) com possíveis modificações
    const defaultGroups = [
        { id: 'todos', name: 'TODOS' },
        { id: 'dpsp', name: 'DPSP' },
        { id: 'swift', name: 'SWIFT' }
    ].filter(group => !removedDefaultFilters.includes(group.id))
        .map(group => {
            if (modifiedDefaultFilters[group.id]) {
                return {
                    ...group,
                    name: modifiedDefaultFilters[group.id].name
                };
            }
            return group;
        });

    // Adicionar grupos customizados
    const customGroups = customFilters.map(filter => ({
        id: filter.id,
        name: filter.name
    }));

    const allGroups = [...defaultGroups, ...customGroups];

    allGroups.forEach(group => {
        const tab = document.querySelector(`[data-group="${group.id}"]`);
        if (tab) {
            const count = group.id === 'todos'
                ? favorites.length
                : favorites.filter(fav => fav.group === group.id).length;

            // Atualizar texto da aba com contador
            const icon = tab.querySelector('i');
            const iconClass = icon ? icon.className : 'fas fa-folder';

            tab.innerHTML = `<i class="${iconClass}"></i> ${group.name} <span class="tab-counter">(${count})</span>`;
        }
    });
}

async function checkLinks(url, skipSave = false, maxLinksOverride = null, showMainLoading = true) {
    // Mostrar loading apenas se não for verificação de favorito
    if (showMainLoading) {
        hideError();
        hideResults();
        showLoading();

        // Desabilitar botão
        checkButton.disabled = true;
        checkButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
    }

    try {
        const maxLinksValue = maxLinksOverride || maxLinks.value;

        const response = await fetch('/api/check-links', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: url,
                checkExternal: checkExternal.checked,
                maxLinks: maxLinksValue === 'unlimited' ? null : parseInt(maxLinksValue)
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao verificar links');
        }

        const report = await response.json();

        if (!skipSave) {
            currentReport = report;
            saveCurrentReport(report);
            if (showMainLoading) {
                hideLoading();
                showResults(report);
            }
        }

        return report;

    } catch (error) {
        console.error('Erro:', error);
        if (showMainLoading) {
            hideLoading();
            showError(error.message || 'Erro inesperado ao verificar links.');
        }

        // Retornar um erro estruturado para manter a consistência
        throw error;
    } finally {
        // Reabilitar botão apenas se for verificação principal
        if (showMainLoading) {
            checkButton.disabled = false;
            checkButton.innerHTML = '<i class="fas fa-search"></i> Verificar Links';
        }
    }
}

function showLoading() {
    loading.style.display = 'block';

    // Simular progresso
    const progressInfo = document.getElementById('progressInfo');
    let step = 0;
    const steps = [
        'Acessando a página...',
        'Extraindo links...',
        'Verificando disponibilidade...',
        'Gerando relatório...'
    ];

    const progressInterval = setInterval(() => {
        if (step < steps.length) {
            progressInfo.textContent = steps[step];
            step++;
        } else {
            clearInterval(progressInterval);
        }
    }, 1000);

    // Limpar intervalo quando necessário
    loading.progressInterval = progressInterval;
}

function hideLoading() {
    loading.style.display = 'none';
    if (loading.progressInterval) {
        clearInterval(loading.progressInterval);
    }
}

function showResultsFromFavorite(report) {
    // Atualizar cards de resumo (sem salvar novamente)
    document.getElementById('totalLinks').textContent = report.totalLinksFound;
    document.getElementById('workingLinks').textContent = report.workingLinks;
    document.getElementById('brokenLinks').textContent = report.brokenLinks;
    document.getElementById('brokenCount').textContent = report.brokenLinks;
    document.getElementById('workingCount').textContent = report.workingLinks;

    // Calcular e mostrar pontuação de saúde
    const healthScore = report.totalLinksChecked > 0
        ? Math.round((report.workingLinks / report.totalLinksChecked) * 100)
        : 0;
    document.getElementById('healthScore').textContent = healthScore + '%';

    // Atualizar cor do card de pontuação baseado na saúde
    const scoreCard = document.querySelector('.summary-card.score .card-icon');
    if (healthScore >= 90) {
        scoreCard.style.background = 'var(--success-color)';
    } else if (healthScore >= 70) {
        scoreCard.style.background = 'var(--warning-color)';
    } else {
        scoreCard.style.background = 'var(--danger-color)';
    }

    // Preencher listas de links
    populateLinksList('brokenLinksList', report.details.broken, 'broken');
    populateLinksList('workingLinksList', report.details.working, 'working');
    populateAllLinksList(report.details);

    // Mostrar área de resultados
    results.style.display = 'block';
}

function showResults(report) {
    // Salvar relatório para persistência
    currentReport = report;
    saveCurrentReport(report);

    // Atualizar cards de resumo
    document.getElementById('totalLinks').textContent = report.totalLinksFound;
    document.getElementById('workingLinks').textContent = report.workingLinks;
    document.getElementById('brokenLinks').textContent = report.brokenLinks;
    document.getElementById('brokenCount').textContent = report.brokenLinks;
    document.getElementById('workingCount').textContent = report.workingLinks;

    // Calcular e mostrar pontuação de saúde
    const healthScore = report.totalLinksChecked > 0
        ? Math.round((report.workingLinks / report.totalLinksChecked) * 100)
        : 0;
    document.getElementById('healthScore').textContent = healthScore + '%';

    // Atualizar cor do card de pontuação baseado na saúde
    const scoreCard = document.querySelector('.summary-card.score .card-icon');
    if (healthScore >= 90) {
        scoreCard.style.background = 'var(--success-color)';
    } else if (healthScore >= 70) {
        scoreCard.style.background = 'var(--warning-color)';
    } else {
        scoreCard.style.background = 'var(--danger-color)';
    }

    // Preencher listas de links
    populateLinksList('brokenLinksList', report.details.broken, 'broken');
    populateLinksList('workingLinksList', report.details.working, 'working');
    populateAllLinksList(report.details);

    // Mostrar informações do relatório salvo
    // showReportSavedNotification(); // Notificação só será chamada ao salvar novo relatório

    results.style.display = 'block';

}

function populateLinksList(containerId, links, type) {
    const container = document.getElementById(containerId);

    if (links.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-${type === 'broken' ? 'check-circle' : 'exclamation-circle'}"></i>
                <h3>${type === 'broken' ? 'Nenhum link quebrado encontrado!' : 'Nenhum link funcionando encontrado.'}</h3>
                <p>${type === 'broken' ? 'Parabéns! Todos os links verificados estão funcionando.' : 'Verifique a conectividade ou as URLs.'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = links.map(link => createLinkItem(link, type)).join('');
}

function populateAllLinksList(details) {
    const container = document.getElementById('allLinksList');
    const allLinks = [...details.broken, ...details.working]
        .sort((a, b) => a.url.localeCompare(b.url));

    container.innerHTML = allLinks.map(link => {
        const type = link.isWorking ? 'working' : 'broken';
        return createLinkItem(link, type);
    }).join('');
}

function createLinkItem(link, type) {
    const statusText = link.isWorking ? 'Funcionando' : 'Quebrado';
    const statusIcon = link.isWorking ? 'check-circle' : 'exclamation-triangle';
    const statusClass = link.isWorking ? 'success' : 'error';

    const errorInfo = link.error ? `<br><small>❌ <strong>Erro:</strong> ${link.error}</small>` : '';
    const statusCode = link.status !== 0 ? `<br><small>📊 <strong>Status:</strong> ${link.status} ${link.statusText}</small>` : '';

    // Informações sobre redirecionamento
    let redirectInfo = '';
    if (link.finalUrl && link.finalUrl !== link.url) {
        redirectInfo = `<br><small>🔄 <strong>Redirecionou para:</strong> ${link.finalUrl}</small>`;
    }

    // Informações sobre análise de URL
    let urlAnalysisInfo = '';
    if (link.urlAnalysis && link.urlAnalysis.isSuspicious) {
        const analysis = link.urlAnalysis;
        urlAnalysisInfo = `
            <div class="url-analysis">
                <div class="analysis-header">
                    <strong>⚠️ URL Suspeita Detectada:</strong>
                </div>
                <div class="analysis-details">
                    ${analysis.suspiciousIndicators.map(indicator =>
            `<div class="analysis-item">${indicator}</div>`
        ).join('')}
                </div>
            </div>
        `;
    }

    // Informações sobre páginas vazias
    let pageAnalysisInfo = '';
    if (link.pageAnalysis) {
        const analysis = link.pageAnalysis;
        let analysisDetails = [];

        if (analysis.isEmpty) {
            analysisDetails.push('📄 Página vazia ou sem conteúdo útil');
        }

        if (analysis.errorIndicators && analysis.errorIndicators.length > 0) {
            analysisDetails.push(`🚨 Indicadores de erro: ${analysis.errorIndicators.join(', ')}`);
        }

        if (analysis.contentLength !== undefined) {
            analysisDetails.push(`📝 Conteúdo: ${analysis.contentLength} caracteres`);
        }

        if (analysis.title) {
            analysisDetails.push(`📰 Título: "${analysis.title}"`);
        }

        if (link.reason) {
            analysisDetails.push(`❌ Motivo: ${link.reason}`);
        }

        pageAnalysisInfo = `
            <div class="page-analysis">
                <div class="analysis-header">
                    <strong>🔍 Análise da Página:</strong>
                </div>
                <div class="analysis-details">
                    ${analysisDetails.map(detail => `<div class="analysis-item">${detail}</div>`).join('')}
                </div>
            </div>
        `;
    }

    // Informações de contexto detalhadas
    let contextInfo = '';
    if (link.context) {
        const ctx = link.context;
        const typeIcons = {
            'link': '🔗',
            'image': '🖼️',
            'stylesheet': '🎨',
            'script': '⚙️',
            'page': '📄'
        };

        const icon = typeIcons[ctx.type] || '📄';
        const elementInfo = ctx.type === 'page' ? 'Página principal' : `<${ctx.element} ${ctx.attribute}="">`;

        contextInfo = `
            <div class="context-info">
                <div class="context-header">
                    <strong>${icon} Localização no código:</strong>
                </div>
                <div class="context-details">
                    <div class="context-item">
                        <strong>Elemento:</strong> <code>${elementInfo}</code>
                    </div>
                    ${ctx.type !== 'page' ? `
                    <div class="context-item">
                        <strong>Seletor CSS:</strong> <code>${ctx.selector}</code>
                    </div>` : ''}
                    <div class="context-item">
                        <strong>Texto/Alt:</strong> "${ctx.text}"
                    </div>
                    ${ctx.type !== 'page' ? `
                    <div class="context-item">
                        <strong>Posição:</strong> ${ctx.position}º elemento do tipo
                    </div>` : ''}
                    ${ctx.originalHref && ctx.originalHref !== link.url ? `
                    <div class="context-item">
                        <strong>URL Original:</strong> <code>${ctx.originalHref}</code>
                    </div>` : ''}
                </div>
            </div>
        `;
    }

    return `
        <div class="link-item ${type}">
            <div class="link-header">
                <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="link-url">
                    ${truncateUrl(link.url, 80)}
                </a>
                <div class="link-status">
                    <span class="status-badge ${statusClass}">
                        <i class="fas fa-${statusIcon}"></i>
                        ${statusText}
                    </span>
                </div>
            </div>
            <div class="link-details">
                <div class="basic-info">
                    <strong>🌐 URL:</strong> ${link.url}
                    ${statusCode}
                    ${errorInfo}
                    ${redirectInfo}
                </div>
                ${urlAnalysisInfo}
                ${pageAnalysisInfo}
                ${contextInfo}
            </div>
        </div>
    `;
}

function truncateUrl(url, maxLength) {
    if (url.length <= maxLength) return url;

    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const path = urlObj.pathname + urlObj.search;

        if (domain.length + 10 >= maxLength) {
            return domain + '...';
        }

        const availableLength = maxLength - domain.length - 3;
        const truncatedPath = path.length > availableLength ?
            path.substring(0, availableLength) + '...' : path;

        return domain + truncatedPath;
    } catch (e) {
        return url.substring(0, maxLength) + '...';
    }
}

function hideResults() {
    results.style.display = 'none';
}

function showError(message) {
    document.getElementById('errorText').textContent = message;
    errorMessage.style.display = 'block';

    // Rolar para o erro
    errorMessage.scrollIntoView({ behavior: 'smooth' });
}

function hideError() {
    errorMessage.style.display = 'none';
}

// Funções do sistema de monitoramento automático
async function toggleAutoMonitoring() {
    monitoringActive = autoMonitoring.checked;

    const settings = loadMonitoringSettings();
    settings.active = monitoringActive;
    saveMonitoringSettings(settings);

    if (monitoringActive) {
        // Solicitar permissão para notificações quando ativar
        const notificationGranted = await requestNotificationPermission();
        if (notificationGranted) {
            showNotification('🔔 Notificações Ativadas', {
                body: 'Você receberá notificações sobre o status das verificações automáticas.',
                tag: 'notification-enabled'
            });
        }
        startAutoMonitoring();
    } else {
        stopAutoMonitoring();
    }

    updateNextCheckDisplay();
}

function startAutoMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }

    // Definir timestamp inicial se não existir
    const settings = loadMonitoringSettings();
    if (!settings.lastCheck) {
        settings.lastCheck = new Date().toISOString();
        saveMonitoringSettings(settings);
    }

    // Verificar a cada hora (3600000 ms)
    monitoringInterval = setInterval(() => {
        checkAllFavorites();
    }, 3600000);

    // Atualizar próxima verificação a cada segundo para tempo real
    updateNextCheckDisplay();
    nextCheckTimeout = setInterval(updateNextCheckDisplay, 1000);

    console.log('Monitoramento automático iniciado');
}

function stopAutoMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }

    if (nextCheckTimeout) {
        clearInterval(nextCheckTimeout);
        nextCheckTimeout = null;
    }

    nextCheck.textContent = 'Desativado';
    console.log('Monitoramento automático parado');
}

async function checkAllFavorites() {
    if (isChecking) {
        console.log('⚠️ Verificação já em andamento, aguardando...');
        return;
    }

    isChecking = true;

    try {
        const favorites = loadFavoriteSites();

        if (favorites.length === 0) {
            console.log('📭 Nenhum site favorito para verificar');
            // Atualizar timestamp da última verificação para evitar loop
            const settings = loadMonitoringSettings();
            settings.lastCheck = new Date().toISOString();
            saveMonitoringSettings(settings);
            return;
        }

        // Solicitar permissão para notificações se ainda não foi concedida
        await requestNotificationPermission();

        // Atualizar timestamp da última verificação
        const settings = loadMonitoringSettings();
        settings.lastCheck = new Date().toISOString();
        saveMonitoringSettings(settings);

        console.log(`🔄 Iniciando verificação sequencial de ${favorites.length} favoritos...`);

        // Notificação de início
        showNotification('🔄 Verificação Iniciada', {
            body: `Iniciando verificação de ${favorites.length} sites favoritos...`,
            tag: 'verification-start'
        });

        let successCount = 0;
        let errorCount = 0;

        // Verificar cada favorito sequencialmente (um após o outro)
        for (let i = 0; i < favorites.length; i++) {
            const favorite = favorites[i];
            console.log(`📋 Verificando ${i + 1}/${favorites.length}: ${favorite.url}`);

            try {
                await checkFavoriteSiteSequential(favorite.id);
                console.log(`✅ Finalizada verificação de: ${favorite.url}`);
                successCount++;
            } catch (error) {
                console.error(`❌ Erro na verificação de ${favorite.url}:`, error);
                errorCount++;
            }

            // Aguardar 3 segundos entre cada verificação para não sobrecarregar
            if (i < favorites.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        console.log('🎉 Verificação automática de todos os favoritos concluída!');

        // Notificação final com resumo
        const summaryMessage = `✅ ${successCount} sites OK | ❌ ${errorCount} com problemas`;
        showNotification('🎉 Verificação Concluída!', {
            body: `Todos os ${favorites.length} sites foram verificados.\n${summaryMessage}`,
            tag: 'verification-complete'
        });

    } catch (error) {
        console.error('❌ Erro durante verificação automática:', error);
        showNotification('❌ Erro na Verificação', {
            body: 'Ocorreu um erro durante a verificação automática.',
            tag: 'verification-error'
        });
    } finally {
        isChecking = false; // Sempre liberar flag de verificação
    }
    updateNextCheckDisplay();
}

function updateNextCheckDisplay() {

    // Verificar se há favoritos
    const favorites = JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVORITE_SITES) || '[]');
    if (!monitoringActive || favorites.length === 0) {
        nextCheck.textContent = 'Desativado';
        // Parar timer de atualização se estiver rodando
        if (nextCheckTimeout) {
            clearInterval(nextCheckTimeout);
            nextCheckTimeout = null;
        }
        return;
    }

    const settings = loadMonitoringSettings();
    const lastCheck = new Date(settings.lastCheck || Date.now());
    const nextCheckTime = new Date(lastCheck.getTime() + 3600000); // +1 hora
    const now = new Date();

    if (nextCheckTime <= now) {
        nextCheck.textContent = 'Verificando...';

        // Se o tempo já passou e ainda não começou a verificação, dispara agora
        if (!isChecking) {
            console.log('⏰ Tempo de verificação atingido, iniciando verificação automática...');
            checkAllFavorites();
        }
        return;
    }

    const timeDiff = nextCheckTime - now;
    const totalSeconds = Math.floor(timeDiff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        nextCheck.textContent = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        nextCheck.textContent = `${minutes}m ${seconds}s`;
    } else {
        nextCheck.textContent = `${seconds}s`;
    }
}

function loadMonitoringSettings() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.MONITORING_SETTINGS) || '{"active": false, "lastCheck": null}');
}

function saveMonitoringSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.MONITORING_SETTINGS, JSON.stringify(settings));
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
}

// Função para toggle da sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('monitoringSidebar');
    const toggleButton = document.querySelector('.toggle-sidebar i');

    if (sidebar.classList.contains('collapsed')) {
        // Expandir sidebar
        sidebar.classList.remove('collapsed');
        toggleButton.className = 'fas fa-chevron-left';
    } else {
        // Colapsar sidebar
        sidebar.classList.add('collapsed');
        toggleButton.className = 'fas fa-chevron-right';
    }
}

// Funções das abas
function showTab(tabId) {
    // Esconder todas as abas
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remover active de todos os botões
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });

    // Mostrar aba selecionada
    document.getElementById(tabId).classList.add('active');

    // Ativar botão correspondente
    event.target.classList.add('active');
}

// Funções de exportação e compartilhamento
function exportReport() {
    if (!currentReport) {
        alert('Nenhum relatório disponível para exportar.');
        return;
    }

    const reportData = {
        ...currentReport,
        exportedAt: new Date().toISOString(),
        exportedBy: 'Robô Verificador de Links'
    };

    const dataStr = JSON.stringify(reportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = `link-report-${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

// Funções do modal
function showInfo() {
    document.getElementById('infoModal').style.display = 'block';
}

function showTips() {
    alert(`🚀 Dicas para manter seu site saudável:

1. ✅ Verifique links regularmente
2. 🔄 Implemente redirecionamentos 301 para páginas movidas
3. 📱 Teste em dispositivos móveis
4. ⚡ Otimize velocidade de carregamento
5. 📈 Monitore com Google Search Console
6. 🔍 Use URLs amigáveis e descritivas
7. 🛡️ Mantenha certificados SSL atualizados
8. 📝 Crie sitemap.xml atualizado

Use este robô semanalmente para manter a qualidade!`);
}

function closeModal() {
    document.getElementById('infoModal').style.display = 'none';
}

// Fechar modal clicando fora
window.onclick = function (event) {
    const modal = document.getElementById('infoModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}

// Atalhos de teclado
document.addEventListener('keydown', function (e) {
    // ESC para fechar modal
    if (e.key === 'Escape') {
        closeModal();
        hideError();
    }

    // Ctrl/Cmd + Enter para verificar links
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!checkButton.disabled) {
            linkForm.dispatchEvent(new Event('submit'));
        }
    }
});

// Placeholder dinâmico
const placeholders = [
    'https://exemplo.com',
    'https://meusite.com.br',
    'https://loja.exemplo.com',
    'https://blog.exemplo.com',
    'https://empresa.com.br'
];

let placeholderIndex = 0;
setInterval(() => {
    urlInput.placeholder = placeholders[placeholderIndex];
    placeholderIndex = (placeholderIndex + 1) % placeholders.length;
}, 3000);

// Auto-focus no input
urlInput.focus();

// Funções adicionais de persistência
function showReportSavedNotification() {
    // Criar notificação temporária
    const notification = document.createElement('div');
    notification.className = 'save-notification';
    notification.innerHTML = '💾 Relatório salvo automaticamente!';
    document.body.appendChild(notification);

    // Remover após 3 segundos
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function restoreLastReport() {
    const savedReport = loadCurrentReport();
    if (savedReport) {
        currentReport = savedReport;
        showResults(savedReport);
        // Não mostrar notificação visual de restauração
        // Não rolar a página ao restaurar relatório
        // window.scrollTo({ top: 0 }); // Se quiser garantir, pode descomentar
    }
}

function clearSavedReport() {
    // Remover relatório salvo do localStorage
    localStorage.removeItem(STORAGE_KEYS.CURRENT_REPORT);
    currentReport = null;

    // Remover notificação visual
    const notification = document.querySelector('.restore-notification');
    if (notification) {
        notification.remove();
    }


    // Esconder resultados da tela
    const results = document.getElementById('results');
    if (results) {
        results.style.display = 'none';
    }

    console.log('🗑️ Relatório salvo removido e notificação apagada');
}

// Inicialização da aplicação
function initializeApp() {
    console.log('🚀 Inicializando aplicação...');

    // Carregar preferências do usuário
    loadUserPreferences();

    // Restaurar último relatório se existir
    restoreLastReport();

    // Carregar filtros customizados e sub-filtros globais
    customFilters = JSON.parse(localStorage.getItem('customFilters')) || [];
    globalSubfilters = JSON.parse(localStorage.getItem('globalSubfilters')) || [];

    // Inicializar sub-filtros de exemplo se não existir nenhum
    if (globalSubfilters.length === 0) {
        globalSubfilters = [];
        saveGlobalSubfilters();
        console.log('🎯 Sub-filtros de exemplo criados:', globalSubfilters);
    }

    updateFilterTabs();
    updateGroupSelects();

    // Carregar sites favoritos
    const favorites = loadFavoriteSites();
    renderFavoriteSites(favorites);

    // Inicializar filtros
    updateActiveFilterIndicator();
    updateSubfiltersVisibility();
    updateSubfilterOptions(); // Carregar sub-filtros no select do formulário
    updatePlaceholderStyles();

    // Carregar configurações de monitoramento
    const monitoringSettings = loadMonitoringSettings();
    autoMonitoring.checked = monitoringSettings.active;
    monitoringActive = monitoringSettings.active;

    // Iniciar monitoramento se estava ativo
    if (monitoringActive) {
        startAutoMonitoring();
    }

    // Configurar eventos
    favoriteUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addFavoriteUrl();
        }
    });

    autoMonitoring.addEventListener('change', toggleAutoMonitoring);

    console.log('✅ Aplicação inicializada com sistema de monitoramento!');
}

// Função para verificar todos os sites do filtro ativo
async function verificarTodosFiltro() {
    const favorites = loadFavoriteSites();

    // Filtrar sites baseado no filtro ativo
    let sitesParaVerificar = favorites;

    if (activeGroupFilter !== 'todos') {
        sitesParaVerificar = favorites.filter(fav => fav.group === activeGroupFilter);
    }

    if (activeSubfilter) {
        sitesParaVerificar = sitesParaVerificar.filter(fav => fav.subfilter === activeSubfilter);
    }

    if (sitesParaVerificar.length === 0) {
        alert('Nenhum site encontrado no filtro ativo para verificar.');
        return;
    }

    // Atualizar botão para mostrar progresso
    const checkAllBtn = document.getElementById('checkAllBtn');
    const checkAllText = document.getElementById('checkAllText');
    const originalText = checkAllText.textContent;

    checkAllBtn.disabled = true;
    checkAllBtn.style.opacity = '0.6';

    console.log(`🔄 Iniciando verificação de ${sitesParaVerificar.length} sites do filtro: ${getGroupDisplayName(activeGroupFilter)}${activeSubfilter ? ` > ${activeSubfilter}` : ''}`);

    // Verificar cada site sequencialmente
    for (let i = 0; i < sitesParaVerificar.length; i++) {
        const site = sitesParaVerificar[i];
        checkAllText.textContent = `Verificando ${i + 1}/${sitesParaVerificar.length}`;

        try {
            await checkFavoriteSiteSequential(site.id);
            console.log(`✅ Site ${i + 1}/${sitesParaVerificar.length} verificado: ${site.url}`);
        } catch (error) {
            console.error(`❌ Erro ao verificar ${site.url}:`, error);
        }

        // Pequena pausa entre verificações para não sobrecarregar
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Restaurar botão
    checkAllBtn.disabled = false;
    checkAllBtn.style.opacity = '1';
    checkAllText.textContent = originalText;

    console.log(`✅ Verificação concluída! ${sitesParaVerificar.length} sites verificados.`);

    // Mostrar notificação de conclusão
    if ('Notification' in window && Notification.permission === 'granted') {
        showNotification('Verificação Concluída', {
            body: `${sitesParaVerificar.length} sites verificados com sucesso!`,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="green"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
        });
    }
}

// Função para verificar site favorito (nova versão)
function verificarSiteFavorito(favoriteId) {
    console.log('🔄 Verificando site favorito ID:', favoriteId);
    checkFavoriteSite(favoriteId);
}

// Função para alternar sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('monitoringSidebar');
    const toggleBtn = sidebar.querySelector('.toggle-sidebar');
    const icon = toggleBtn.querySelector('i');

    // Encontrar as colunas do Bootstrap de forma mais direta
    const sidebarCol = sidebar.parentElement; // Div pai da sidebar
    const mainCol = document.querySelector('.main-area').parentElement; // Div pai da main-area

    console.log('Sidebar Col encontrada:', sidebarCol);
    console.log('Main Col encontrada:', mainCol);
    console.log('Estado atual collapsed:', sidebar.classList.contains('collapsed'));

    sidebar.classList.toggle('collapsed');

    // Só ajusta as colunas se NÃO estiver no mobile
    if (window.innerWidth > 768) {
        if (sidebar.classList.contains('collapsed')) {
            icon.className = 'fas fa-chevron-right';

            if (sidebarCol) {
                sidebarCol.classList.remove('col-12', 'col-md-4', 'col-lg-4', 'col-md-8', 'col-lg-8', 'col-md-9', 'col-lg-9', 'col-md-3', 'col-lg-3');
                sidebarCol.classList.add('col-12', 'col-md-3', 'col-lg-3');
                console.log('✅ Sidebar FECHADA para:', sidebarCol.className);
            }
            if (mainCol) {
                mainCol.classList.remove('col-12', 'col-md-4', 'col-lg-4', 'col-md-8', 'col-lg-8', 'col-md-9', 'col-lg-9', 'col-md-3', 'col-lg-3');
                mainCol.classList.add('col-12', 'col-md-9', 'col-lg-9');
                console.log('✅ Main expandida para:', mainCol.className);
            }
        } else {
            icon.className = 'fas fa-chevron-left';

            if (sidebarCol) {
                sidebarCol.classList.remove('col-12', 'col-md-3', 'col-lg-3', 'col-md-8', 'col-lg-8', 'col-md-9', 'col-lg-9', 'col-md-4', 'col-lg-4');
                sidebarCol.classList.add('col-12', 'col-md-4', 'col-lg-4');
                console.log('✅ Sidebar ABERTA para:', sidebarCol.className);
            }
            if (mainCol) {
                mainCol.classList.remove('col-12', 'col-md-3', 'col-lg-3', 'col-md-4', 'col-lg-4', 'col-md-9', 'col-lg-9');
                mainCol.classList.add('col-12', 'col-md-8', 'col-lg-8');
                console.log('✅ Main reduzida para:', mainCol.className);
            }
        }
    }
}

// Funções para controlar sidebar modal no mobile
function toggleMobileSidebar() {
    // Verificar se está no mobile (768px ou menos)
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('monitoringSidebar');
        const overlay = document.getElementById('sidebarOverlay');

        if (sidebar.classList.contains('mobile-open')) {
            closeMobileSidebar();
        } else {
            openMobileSidebar();
        }
    }
}

function openMobileSidebar() {
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('monitoringSidebar');
        const overlay = document.getElementById('sidebarOverlay');

        sidebar.classList.add('mobile-open');
        overlay.classList.add('active');

        // Prevenir scroll do body
        document.body.style.overflow = 'hidden';
    }
}

function closeMobileSidebar() {
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('monitoringSidebar');
        const overlay = document.getElementById('sidebarOverlay');

        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('active');

        // Restaurar scroll do body
        document.body.style.overflow = '';
    }
}

// Verificar mudança de tamanho da tela
window.addEventListener('resize', function () {
    if (window.innerWidth > 768) {
        closeMobileSidebar();
    }
});

// Fechar sidebar com ESC no mobile
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && window.innerWidth <= 768) {
        closeMobileSidebar();
    }
});

// Função para alternar visibilidade do formulário de favoritos
function toggleFavoriteForm() {
    const form = document.getElementById('addFavoriteForm');
    const button = document.querySelector('.btn-add-favorite');
    const container = document.querySelector('.add-favorite-container');
    const icon = button.querySelector('i');

    if (form.style.display === 'none' || form.style.display === '') {
        // Mostrar formulário
        form.style.display = 'block';
        button.innerHTML = '<i class="fas fa-minus"></i> Fechar';
        button.classList.add('active');
        container.style.paddingBottom = '20px'; // Adicionar padding quando aberto
    } else {
        // Ocultar formulário
        form.style.display = 'none';
        button.innerHTML = '<i class="fas fa-plus"></i> Adicionar Favorito';
        button.classList.remove('active');
        container.style.paddingBottom = '0'; // Remover padding quando fechado
    }
}

// ========== FUNÇÕES PARA GERENCIAR FILTROS GLOBAIS ==========

// Variável para armazenar filtros customizados
let customFilters = JSON.parse(localStorage.getItem('customFilters')) || [];

// Abrir modal de editar filtros
function openEditFiltersModal() {
    const modal = document.getElementById('editFiltersModal');
    modal.style.display = 'block';
    loadExistingFilters();
    // resetSubfilterAccordion(); // Não mais necessário

    // Adicionar evento Enter no input de sub-filtros
    const subfilterInput = document.getElementById('newSubfilterInput');
    if (subfilterInput) {
        subfilterInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addSubfilterFromModal();
            }
        });
    }
}

// Fechar modal de editar filtros
function closeEditFiltersModal() {
    const modal = document.getElementById('editFiltersModal');
    modal.style.display = 'none';
    document.getElementById('addFilterForm').reset();
}

// Carregar filtros existentes
function loadExistingFilters() {
    const existingFiltersList = document.getElementById('existingFiltersList');

    // Filtros removidos e modificados
    const removedDefaultFilters = JSON.parse(localStorage.getItem('removedDefaultFilters')) || [];
    const modifiedDefaultFilters = JSON.parse(localStorage.getItem('modifiedDefaultFilters')) || {};

    // Filtros padrão com possíveis modificações
    const defaultFilters = [
        { id: 'todos', name: 'Todos', icon: 'fas fa-globe', type: 'protected' }, // Protegido
        { id: 'dpsp', name: 'DPSP', icon: 'fas fa-building', type: 'default' },
        { id: 'swift', name: 'SWIFT', icon: 'fas fa-filter', type: 'default' },
    ].filter(filter => !removedDefaultFilters.includes(filter.id))
        .map(filter => {
            if (modifiedDefaultFilters[filter.id]) {
                return {
                    ...filter,
                    name: modifiedDefaultFilters[filter.id].name,
                    icon: modifiedDefaultFilters[filter.id].icon,
                    subfilters: modifiedDefaultFilters[filter.id].subfilters
                };
            }
            return filter;
        });

    // Combinar filtros padrão com customizados
    const allFilters = [...defaultFilters, ...customFilters];

    if (allFilters.length === 0) {
        existingFiltersList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Nenhum filtro personalizado criado ainda.</p>';
        return;
    }

    existingFiltersList.innerHTML = allFilters.map(filter => `
        <div class="filter-item">
            <div class="filter-info">
                <i class="${filter.icon}"></i>
                <span class="filter-name">${filter.name}</span>
                ${filter.subfilters && filter.subfilters.length > 0 ?
            `<span class="filter-sub">(${filter.subfilters.join(', ')})</span>` :
            ''
        }
            </div>
            <div class="filter-actions">
                ${filter.id !== 'todos' ?
            `<button onclick="editFilter('${filter.id}', '${filter.type}')" class="btn btn-edit" title="Editar">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button onclick="removeFilter('${filter.id}', '${filter.type}')" class="btn btn-danger" title="Remover">
                        <i class="fas fa-trash"></i>
                    </button>` :
            '<span style="color: var(--text-secondary); font-size: 12px;">Protegido</span>'
        }
            </div>
        </div>
    `).join('');

    // Carregar sub-filtros globais
    loadExistingSubfilters();
}

// Carregar sub-filtros existentes na seção do modal principal
function loadExistingSubfilters() {
    const existingSubfiltersList = document.getElementById('existingSubfiltersList');

    if (!existingSubfiltersList) {
        return; // Elemento não existe ainda
    }

    if (globalSubfilters.length === 0) {
        existingSubfiltersList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Nenhum sub-filtro criado ainda.</p>';
        return;
    }

    existingSubfiltersList.innerHTML = globalSubfilters.map((subfilter, index) => `
        <div class="filter-item">
            <div class="filter-info">
                <i class="fas fa-tag"></i>
                <span class="filter-name">${subfilter}</span>
            </div>
            <div class="filter-actions">
                <button onclick="editSubfilter(${index})" class="btn btn-edit" title="Editar">
                    <i class="fas fa-pencil-alt"></i>
                </button>
                <button onclick="removeSubfilter(${index})" class="btn btn-danger" title="Remover">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Adicionar sub-filtro pelo modal principal
function addSubfilterFromModal() {
    const input = document.getElementById('newSubfilterInput');
    const newSubfilter = input.value.trim();

    if (!newSubfilter) {
        alert('Por favor, digite o nome do sub-filtro.');
        return;
    }

    if (newSubfilter.length > 20) {
        alert('Nome do sub-filtro deve ter no máximo 20 caracteres.');
        return;
    }

    // Verificar se já existe
    if (globalSubfilters.includes(newSubfilter)) {
        alert('Este sub-filtro já existe.');
        return;
    }

    // Adicionar à lista global
    globalSubfilters.push(newSubfilter);
    saveGlobalSubfilters();

    // Recarregar listas
    loadExistingSubfilters();

    // Atualizar interface principal
    updateSubfiltersVisibility();
    updateSubfilterOptions();

    // Limpar sub-filtros inválidos dos favoritos e recarregar
    cleanupInvalidSubfilters();

    // Limpar input
    input.value = '';

    showSuccessMessage(`Sub-filtro "${newSubfilter}" adicionado com sucesso!`);
}

// Editar sub-filtro
function editSubfilter(index) {
    const subfilterData = {
        index: index,
        name: globalSubfilters[index]
    };

    // Abrir modal de edição
    openEditSubfilterModal(subfilterData);
}

// Abrir modal de editar sub-filtro específico
function openEditSubfilterModal(subfilterData) {
    // Criar modal de edição se não existir
    let editModal = document.getElementById('editSingleSubfilterModal');
    if (!editModal) {
        createEditSubfilterModal();
        editModal = document.getElementById('editSingleSubfilterModal');
    }

    // Preencher campos
    document.getElementById('editSubfilterIndex').value = subfilterData.index;
    document.getElementById('editSubfilterName').value = subfilterData.name;

    // Mostrar modal
    editModal.style.display = 'block';
}

// Criar modal de edição de sub-filtro dinâmicamente
function createEditSubfilterModal() {
    const modalHTML = `
        <div id="editSingleSubfilterModal" class="modal" style="display: none;">
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2><i class="fas fa-edit"></i> Editar Sub-filtro</h2>
                    <span class="close" onclick="closeEditSubfilterModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="editSubfilterForm">
                        <input type="hidden" id="editSubfilterIndex">
                        
                        <div class="form-group">
                            <label for="editSubfilterName">Nome do Sub-filtro:</label>
                            <input type="text" id="editSubfilterName" maxlength="20" required placeholder="Digite o nome do sub-filtro">
                            <small style="color: var(--text-secondary); font-size: 12px;">Máximo 20 caracteres</small>
                        </div>
                        
                        <div class="form-actions">
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-save"></i> Salvar Alterações
                            </button>
                            <button type="button" onclick="closeEditSubfilterModal()" class="btn btn-secondary">
                                <i class="fas fa-times"></i> Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Adicionar evento de submit
    document.getElementById('editSubfilterForm').addEventListener('submit', function (e) {
        e.preventDefault();
        saveSubfilterChanges();
    });
}

// Fechar modal de edição de sub-filtro
function closeEditSubfilterModal() {
    const modal = document.getElementById('editSingleSubfilterModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Salvar alterações do sub-filtro
function saveSubfilterChanges() {
    const index = parseInt(document.getElementById('editSubfilterIndex').value);
    const newName = document.getElementById('editSubfilterName').value.trim();
    const oldName = globalSubfilters[index];

    if (!newName) {
        alert('Por favor, digite o nome do sub-filtro.');
        return;
    }

    if (newName.length > 20) {
        alert('Nome do sub-filtro deve ter no máximo 20 caracteres.');
        return;
    }

    if (newName === oldName) {
        closeEditSubfilterModal();
        return; // Sem alteração
    }

    // Verificar se já existe
    if (globalSubfilters.includes(newName)) {
        alert('Este sub-filtro já existe.');
        return;
    }

    // Atualizar nome
    globalSubfilters[index] = newName;
    saveGlobalSubfilters();

    // Atualizar sites favoritos que usam este sub-filtro
    const favorites = loadFavoriteSites();
    const updatedFavorites = favorites.map(fav => {
        if (fav.subfilter === oldName) {
            return { ...fav, subfilter: newName };
        }
        return fav;
    });
    saveFavoriteSites(updatedFavorites);

    // Recarregar interface
    loadExistingSubfilters();
    updateSubfiltersVisibility();
    updateSubfilterOptions();
    renderFavoriteSites(updatedFavorites);
    closeEditSubfilterModal();

    showSuccessMessage(`Sub-filtro "${oldName}" renomeado para "${newName}" com sucesso!`);
}

// Criar modal de confirmação customizado
function showConfirmModal(title, message, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>${title}</h3>
            </div>
            <div class="modal-body">
                <p>${message}</p>
                <div class="modal-actions">
                    <button class="btn-confirm" onclick="confirmAction()">
                        <i class="fas fa-trash"></i> Sim, excluir
                    </button>
                    <button class="btn-cancel" onclick="cancelAction()">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Funções globais temporárias
    window.confirmAction = () => {
        document.body.removeChild(modal);
        onConfirm();
        delete window.confirmAction;
        delete window.cancelAction;
    };

    window.cancelAction = () => {
        document.body.removeChild(modal);
        delete window.confirmAction;
        delete window.cancelAction;
    };

    // Fechar ao clicar fora
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            window.cancelAction();
        }
    });
}

// Remover sub-filtro
function removeSubfilter(index) {
    const subfilterName = globalSubfilters[index];

    showConfirmModal(
        'Excluir Sub-filtro',
        `Tem certeza que deseja remover o sub-filtro "<strong>${subfilterName}</strong>"?<br><br>Ele será removido de todos os grupos que o utilizam.`,
        () => {
            globalSubfilters.splice(index, 1);
            saveGlobalSubfilters();
            loadExistingSubfilters();
            updateSubfiltersVisibility();
            updateSubfilterOptions();

            // Limpar sub-filtros inválidos dos favoritos e recarregar
            cleanupInvalidSubfilters();

            showSuccessMessage(`Sub-filtro "${subfilterName}" removido com sucesso!`);
        }
    );
}

// Adicionar novo filtro
document.addEventListener('DOMContentLoaded', function () {
    const addFilterForm = document.getElementById('addFilterForm');
    if (addFilterForm) {
        addFilterForm.addEventListener('submit', function (e) {
            e.preventDefault();

            const groupName = document.getElementById('filterGroupName').value.trim();
            const icon = document.getElementById('filterIcon').value;

            if (!groupName) {
                alert('Por favor, insira o nome do grupo.');
                return;
            }

            // Criar ID único baseado no nome
            const filterId = groupName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

            // Verificar se já existe
            const existingFilter = customFilters.find(f => f.id === filterId);
            if (existingFilter) {
                alert('Já existe um filtro com este nome.');
                return;
            }

            // Criar novo filtro
            const newFilter = {
                id: filterId,
                name: groupName.toUpperCase(),
                icon: icon,
                type: 'custom',
                subfilters: []
            };

            customFilters.push(newFilter);
            saveCustomFilters();

            // Atualizar interface
            updateFilterTabs();
            loadExistingFilters();

            // Limpar formulário
            this.reset();

            showSuccessMessage(`Filtro "${groupName}" criado com sucesso!`);
        });
    }
});

// Salvar filtros customizados
function saveCustomFilters() {
    localStorage.setItem('customFilters', JSON.stringify(customFilters));
}

// Remover filtro (padrão ou customizado)
function removeFilter(filterId, filterType) {
    if (filterId === 'todos') {
        alert('O filtro "TODOS" não pode ser removido pois é essencial para o funcionamento do sistema.');
        return;
    }

    const filterName = getFilterNameById(filterId);

    showConfirmModal(
        'Excluir Filtro',
        `Tem certeza que deseja remover o filtro "<strong>${filterName}</strong>"?`,
        () => {
            if (filterType === 'custom') {
                // Remover filtro customizado
                customFilters = customFilters.filter(f => f.id !== filterId);
                saveCustomFilters();
            } else {
                // Remover filtro padrão - adicionar à lista de filtros removidos
                let removedDefaultFilters = JSON.parse(localStorage.getItem('removedDefaultFilters')) || [];
                if (!removedDefaultFilters.includes(filterId)) {
                    removedDefaultFilters.push(filterId);
                    localStorage.setItem('removedDefaultFilters', JSON.stringify(removedDefaultFilters));
                }
            }

            // Se o filtro ativo foi removido, voltar para "todos"
            if (activeGroupFilter === filterId) {
                filterByGroup('todos');
            }

            // Atualizar interface
            updateFilterTabs();
            updateGroupSelects();
            loadExistingFilters();
            showSuccessMessage(`Filtro "${filterName}" removido com sucesso!`);
        }
    );
}

// Função auxiliar para obter nome do filtro por ID
function getFilterNameById(filterId) {
    // Removido: home, produtos, categorias

    const customFilter = customFilters.find(f => f.id === filterId);
    return customFilter ? customFilter.name : filterId;
}

// Editar filtro existente
function editFilter(filterId, filterType) {
    let filterData;
    const modifiedDefaultFilters = JSON.parse(localStorage.getItem('modifiedDefaultFilters')) || {};

    if (filterType === 'custom') {
        filterData = customFilters.find(f => f.id === filterId);
    } else {
        // Filtros padrão
        const defaultFiltersMap = {
            'dpsp': { id: 'dpsp', name: 'DPSP', icon: 'fas fa-home' },
            'swift': { id: 'swift', name: 'SWIFT', icon: 'fas fa-shopping-cart' }
        };
        filterData = defaultFiltersMap[filterId];
        // Se foi modificado, usa o nome e ícone modificados
        if (modifiedDefaultFilters[filterId]) {
            filterData = {
                ...filterData,
                ...modifiedDefaultFilters[filterId]
            };
        }
    }

    if (!filterData) {
        alert('Filtro não encontrado!');
        return;
    }

    // Preencher modal de edição
    openEditFilterModal(filterData, filterType);
}

// Abrir modal de editar filtro específico
function openEditFilterModal(filterData, filterType) {
    // Criar modal de edição se não existir
    let editModal = document.getElementById('editSingleFilterModal');
    if (!editModal) {
        createEditFilterModal();
        editModal = document.getElementById('editSingleFilterModal');
    }

    // Preencher campos
    document.getElementById('editFilterId').value = filterData.id;
    document.getElementById('editFilterType').value = filterType;
    document.getElementById('editFilterGroupName').value = filterData.name;
    document.getElementById('editFilterIcon').value = filterData.icon;

    // Mostrar modal
    editModal.style.display = 'block';
}

// ========== GERENCIADOR GLOBAL DE SUB-FILTROS ==========

// Variável para armazenar sub-filtros globais
let globalSubfilters = JSON.parse(localStorage.getItem('globalSubfilters')) || [];

// Salvar sub-filtros globais
function saveGlobalSubfilters() {
    localStorage.setItem('globalSubfilters', JSON.stringify(globalSubfilters));
}

// Limpar sub-filtros inválidos dos sites favoritos
function cleanupInvalidSubfilters() {
    const favorites = loadFavoriteSites();
    let hasChanges = false;

    const updatedFavorites = favorites.map(favorite => {
        if (favorite.subfilter && !globalSubfilters.includes(favorite.subfilter)) {
            console.log(`🧹 Removendo sub-filtro inválido "${favorite.subfilter}" do site ${favorite.url}`);
            hasChanges = true;
            return { ...favorite, subfilter: null };
        }
        return favorite;
    });

    if (hasChanges) {
        saveFavoriteSites(updatedFavorites);
        renderFavoriteSites(updatedFavorites);
        console.log('🔄 Sub-filtros inválidos removidos dos sites favoritos');
    } else {
        renderFavoriteSites(favorites);
    }
}

// Criar modal de edição dinâmicamente
function createEditFilterModal() {
    const modalHTML = `
        <div id="editSingleFilterModal" class="modal" style="display: none;">
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2><i class="fas fa-edit"></i> Editar Filtro</h2>
                    <span class="close" onclick="closeEditFilterModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="editFilterForm">
                        <input type="hidden" id="editFilterId">
                        <input type="hidden" id="editFilterType">
                        
                        <div class="form-group">
                            <label for="editFilterGroupName">Nome do Grupo:</label>
                            <input type="text" id="editFilterGroupName" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="editFilterIcon">Ícone do Grupo:</label>
                            <select id="editFilterIcon">
                                <option value="fas fa-globe">🌐 Globe</option>
                                <option value="fas fa-building">🏢 Building</option>
                                <option value="fas fa-shopping-cart">🛒 Shopping Cart</option>
                                <option value="fas fa-shipping-fast">🚚 Shipping</option>
                                <option value="fas fa-folder">📁 Folder</option>
                                <option value="fas fa-users">👥 Users</option>
                                <option value="fas fa-share-alt">🔗 Share</option>
                                <option value="fas fa-graduation-cap">🎓 Education</option>
                                <option value="fas fa-briefcase">💼 Business</option>
                                <option value="fas fa-heart">❤️ Heart</option>
                                <option value="fas fa-star">⭐ Star</option>
                                <option value="fas fa-home">🏠 Home</option>
                                <option value="fas fa-cog">⚙️ Settings</option>
                                <option value="fas fa-gamepad">🎮 Games</option>
                                <option value="fas fa-music">🎵 Music</option>
                                <option value="fas fa-camera">📷 Photo</option>
                                <option value="fas fa-code">💻 Code</option>
                                <option value="fas fa-newspaper">📰 News</option>
                            </select>
                        </div>
                        
                        <div class="form-actions">
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-save"></i> Salvar Alterações
                            </button>
                            <button type="button" onclick="closeEditFilterModal()" class="btn btn-secondary">
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Adicionar evento de submit
    document.getElementById('editFilterForm').addEventListener('submit', function (e) {
        e.preventDefault();
        saveFilterChanges();
    });

    // Função para salvar alterações do filtro
    function saveFilterChanges() {
        const filterId = document.getElementById('editFilterId').value;
        const filterType = document.getElementById('editFilterType').value;
        const filterName = document.getElementById('editFilterGroupName').value.trim();
        const filterIcon = document.getElementById('editFilterIcon').value;

        if (!filterName) {
            alert('Por favor, digite o nome do filtro.');
            return;
        }

        // Atualizar filtro no localStorage
        const removedDefaultFilters = JSON.parse(localStorage.getItem('removedDefaultFilters')) || [];
        const modifiedDefaultFilters = JSON.parse(localStorage.getItem('modifiedDefaultFilters')) || {};

        modifiedDefaultFilters[filterId] = {
            name: filterName,
            icon: filterIcon
        };
        localStorage.setItem('modifiedDefaultFilters', JSON.stringify(modifiedDefaultFilters));

        // Atualizar interface
        updateFilterTabs();
        updateGroupSelects();
        loadExistingFilters();

        // Recarregar favoritos para atualizar badges
        const favorites = loadFavoriteSites();
        renderFavoriteSites(favorites);

        // Forçar atualização do indicador ativo
        updateActiveFilterIndicator();

        closeEditFilterModal();
        showSuccessMessage(`Filtro "${filterName}" atualizado com sucesso!`);
    }
}

// Fechar modal de edição
function closeEditFilterModal() {
    const modal = document.getElementById('editSingleFilterModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Salvar alterações do filtro
function updateFilterTabs() {
    // Atualizar abas de grupos principais
    const groupTabs = document.getElementById('groupTabs');
    if (!groupTabs) return;

    // Filtros padrão + customizados
    const removedDefaultFilters = JSON.parse(localStorage.getItem('removedDefaultFilters')) || [];
    const modifiedDefaultFilters = JSON.parse(localStorage.getItem('modifiedDefaultFilters')) || {};

    const defaultFilters = [
        { id: 'todos', name: 'Todos', icon: 'fas fa-globe', type: 'protected' },
        { id: 'dpsp', name: 'DPSP', icon: 'fas fa-building', type: 'default' },
        { id: 'swift', name: 'SWIFT', icon: 'fas fa-filter', type: 'default' }
    ].filter(f => !removedDefaultFilters.includes(f.id))
        .map(f => modifiedDefaultFilters[f.id] ? { ...f, ...modifiedDefaultFilters[f.id] } : f);

    // Garantir que só os filtros válidos apareçam
    const allFilters = [...defaultFilters, ...customFilters];

    // Renderizar tabs e accordion apenas com os filtros válidos
    groupTabs.innerHTML = allFilters.map(filter => `
        <div class="tab group-tab" data-group="${filter.id}" onclick="filterByGroup('${filter.id}')">
            <i class="${filter.icon}"></i> ${filter.name}
        </div>
    `).join('');

    const filtersAccordion = document.getElementById('filtersAccordion');
    if (filtersAccordion) {
        filtersAccordion.innerHTML = allFilters.map(filter => `
            <div class="accordion-filter-item" data-group="${filter.id}" onclick="filterByGroup('${filter.id}')">
                <i class="${filter.icon}"></i> ${filter.name}
            </div>
        `).join('');
    }
}
// ...existing code...

// Manter função para compatibilidade (agora chama a nova função)
function removeCustomFilter(filterId) {
    removeFilter(filterId, 'custom');
}

// Atualizar abas de filtro na interface principal
function updateFilterTabs() {
    const groupTabs = document.querySelector('.group-tabs');
    if (!groupTabs) return;

    // Filtros removidos e modificados
    const removedDefaultFilters = JSON.parse(localStorage.getItem('removedDefaultFilters')) || [];
    const modifiedDefaultFilters = JSON.parse(localStorage.getItem('modifiedDefaultFilters')) || {};

    // Filtros padrão (exceto os removidos) com possíveis modificações
    const defaultFilters = [
        { id: 'todos', name: 'TODOS', icon: 'fas fa-globe' },
        { id: 'dpsp', name: 'DPSP', icon: 'fas fa-building' },
        { id: 'swift', name: 'SWIFT', icon: 'fas fa-filter' }
    ].filter(filter => !removedDefaultFilters.includes(filter.id))
        .map(filter => {
            if (modifiedDefaultFilters[filter.id]) {
                return {
                    ...filter,
                    name: modifiedDefaultFilters[filter.id].name,
                    icon: modifiedDefaultFilters[filter.id].icon
                };
            }
            return filter;
        });

    // Criar abas padrão
    const defaultTabs = defaultFilters.map(filter => `
        <div class="tab${filter.id === 'todos' ? ' active' : ''}" data-group="${filter.id}" onclick="filterByGroup('${filter.id}')">
            <i class="${filter.icon}"></i> ${filter.name}
        </div>
    `).join('');

    // Criar abas customizadas
    const customTabs = customFilters.map(filter => `
        <div class="tab" data-group="${filter.id}" onclick="filterByGroup('${filter.id}')">
            <i class="${filter.icon}"></i> ${filter.name}
        </div>
    `).join('');

    groupTabs.innerHTML = defaultTabs + customTabs;

    // Atualizar também os selects de grupo
    updateGroupSelects();
}

// Atualizar selects de grupo no formulário
function updateGroupSelects() {
    const groupSelect = document.getElementById('groupSelect');
    const newGroupSelect = document.getElementById('newGroupSelect');

    // Filtros removidos e modificados
    const removedDefaultFilters = JSON.parse(localStorage.getItem('removedDefaultFilters')) || [];
    const modifiedDefaultFilters = JSON.parse(localStorage.getItem('modifiedDefaultFilters')) || {};

    // Filtros padrão (exceto os removidos) com possíveis modificações
    const defaultFilters = [
        { value: 'home', text: 'HOME' },
        { value: 'produtos', text: 'PRODUTOS' },
        { value: 'categorias', text: 'CATEGORIAS' }
    ].filter(filter => !removedDefaultFilters.includes(filter.value))
        .map(filter => {
            if (modifiedDefaultFilters[filter.value]) {
                return {
                    ...filter,
                    text: modifiedDefaultFilters[filter.value].name
                };
            }
            return filter;
        });

    // Criar opções padrão com placeholder
    const defaultOptions = [
        { value: '', text: 'Selecione o grupo', selected: true },
        ...defaultFilters
    ].map(option => `<option value="${option.value}"${option.selected ? ' selected' : ''}>${option.text}</option>`)
        .join('');

    // Opções customizadas
    const customOptions = customFilters.map(filter =>
        `<option value="${filter.id}">${filter.name}</option>`
    ).join('');

    // Atualizar select principal (formulário de favoritos)
    if (groupSelect) {
        const currentValue = groupSelect.value;
        groupSelect.innerHTML = defaultOptions + customOptions;
        if (currentValue) groupSelect.value = currentValue;
    }

    // Atualizar select do modal (se existir) - sem o placeholder
    if (newGroupSelect) {
        const modalDefaultOptions = defaultFilters
            .map(option => `<option value="${option.value}">${option.text}</option>`)
            .join('');

        newGroupSelect.innerHTML = modalDefaultOptions + customOptions;
    }
}

// Fechar modal quando clicar fora
window.addEventListener('click', function (event) {
    const editFiltersModal = document.getElementById('editFiltersModal');
    const editSubfilterModal = document.getElementById('editSingleSubfilterModal');

    if (event.target === editFiltersModal) {
        closeEditFiltersModal();
    }

    if (event.target === editSubfilterModal) {
        closeEditSubfilterModal();
    }
});

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', initializeApp);

// =======================
// GERENCIAMENTO DO ACCORDION DE SUB-FILTROS
// =======================

function toggleSubfilterAccordion() {
    const content = document.getElementById('subfilterAccordionContent');
    const icon = document.getElementById('accordionIcon');

    content.classList.toggle('open');

    if (content.classList.contains('open')) {
        icon.style.transform = 'rotate(180deg)';
        loadSubfilterOptions();
    } else {
        icon.style.transform = 'rotate(0deg)';
    }
}

function loadSubfilterOptions() {
    const container = document.getElementById('subfilterOptions');
    const allSubfilters = JSON.parse(localStorage.getItem('globalSubfilters') || '[]');

    container.innerHTML = '';

    // Adicionar sub-filtros existentes
    allSubfilters.forEach(subfilter => {
        const option = document.createElement('div');
        option.className = 'subfilter-option';
        option.innerHTML = `
            <i class="fas fa-tag"></i>
            <span>${subfilter}</span>
        `;
        option.onclick = () => selectSubfilterOption(subfilter);
        container.appendChild(option);
    });

    // Adicionar opção "Criar Novo Sub"
    const createNewOption = document.createElement('div');
    createNewOption.className = 'subfilter-option create-new';
    createNewOption.innerHTML = `
        <i class="fas fa-plus"></i>
        <span>Criar Novo Sub-filtro</span>
    `;
    createNewOption.onclick = () => navigateToSubfilterSection();
    container.appendChild(createNewOption);

    // Se não há sub-filtros, mostrar mensagem
    if (allSubfilters.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'subfilter-option';
        emptyMessage.style.opacity = '0.6';
        emptyMessage.innerHTML = `
            <i class="fas fa-info-circle"></i>
            <span>Nenhum sub-filtro encontrado</span>
        `;
        container.insertBefore(emptyMessage, createNewOption);
    }
}

function selectSubfilterOption(subfilter) {
    const hiddenInput = document.getElementById('filterSubName');
    const accordionHeader = document.querySelector('.subfilter-accordion-header span');

    hiddenInput.value = subfilter;
    accordionHeader.textContent = `Selecionado: ${subfilter}`;

    // Marcar como selecionado visualmente
    document.querySelectorAll('.subfilter-option').forEach(opt => {
        opt.classList.remove('selected');
    });

    event.target.closest('.subfilter-option').classList.add('selected');

    // Fechar accordion
    toggleSubfilterAccordion();
}

function navigateToSubfilterSection() {
    // Fechar accordion primeiro
    toggleSubfilterAccordion();

    // Scroll para a seção de sub-filtros
    setTimeout(() => {
        const subfilterSection = document.querySelector('.add-subfilter-section');
        if (subfilterSection) {
            subfilterSection.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });

            // Focus no input e mostrar tooltip
            const input = subfilterSection.querySelector('input');
            if (input) {
                setTimeout(() => {
                    input.focus();
                    showInputTooltip(input);
                }, 300);
            }
        }
    }, 100);
}

function showInputTooltip(inputElement) {
    const tooltip = document.createElement('div');
    tooltip.className = 'input-tooltip';
    tooltip.textContent = 'Preencha aqui o novo sub-filtro';

    document.body.appendChild(tooltip);

    // Posicionar o tooltip acima do input
    const rect = inputElement.getBoundingClientRect();
    tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
    tooltip.style.top = rect.top - tooltip.offsetHeight - 10 + 'px';

    // Mostrar tooltip
    setTimeout(() => tooltip.classList.add('show'), 10);

    // Remover tooltip após 3 segundos
    setTimeout(() => {
        tooltip.classList.remove('show');
        setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
            }
        }, 300);
    }, 3000);
}

// Resetar accordion quando modal for aberto
function resetSubfilterAccordion() {
    const content = document.getElementById('subfilterAccordionContent');
    const icon = document.getElementById('accordionIcon');
    const hiddenInput = document.getElementById('filterSubName');
    const accordionHeader = document.querySelector('.subfilter-accordion-header span');

    if (content) content.classList.remove('open');
    if (icon) icon.style.transform = 'rotate(0deg)';
    if (hiddenInput) hiddenInput.value = '';
    if (accordionHeader) accordionHeader.textContent = 'Escolher um sub-filtro';
}

// ========== BOTÃO VOLTAR AO TOPO ==========

// Função para voltar ao topo
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// Mostrar/ocultar botão baseado no scroll
function toggleBackToTopButton() {
    const backToTop = document.getElementById('backToTop');

    if (window.scrollY > 200) {
        backToTop.classList.add('visible');
    } else {
        backToTop.classList.remove('visible');
    }
}

// Controlar posição do sidebar no mobile baseado no scroll
function handleMobileSidebarPosition() {
    const sidebar = document.querySelector('.monitoring-sidebar');
    if (!sidebar) return;

    // Só aplica no mobile (768px ou menos)
    if (window.innerWidth > 768) {
        sidebar.classList.remove('mobile-fixed');
        return;
    }

    // Não aplica se o sidebar estiver aberto (modal)
    if (sidebar.classList.contains('mobile-open')) {
        return;
    }

    const sidebarContainer = sidebar.parentElement;
    const containerRect = sidebarContainer.getBoundingClientRect();

    // Se o container do sidebar saiu da visão (topo < 0), fixa o sidebar
    if (containerRect.top <= 0) {
        sidebar.classList.add('mobile-fixed');
    } else {
        sidebar.classList.remove('mobile-fixed');
    }
}

// Event listener para o scroll
window.addEventListener('scroll', () => {
    toggleBackToTopButton();
    handleMobileSidebarPosition();
});

// Event listener para redimensionamento da janela
window.addEventListener('resize', handleMobileSidebarPosition);

// Verificar posição inicial ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    toggleBackToTopButton();
    handleMobileSidebarPosition();
});

console.log('🤖 Robô Verificador de Links carregado com sucesso!');