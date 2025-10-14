const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const { URL } = require('url');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Função para validar URL
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Função para verificar se um link está quebrado (agora aceita contexto)
async function checkLink(linkContext, timeout = 10000) {
    const url = linkContext.url || linkContext; // Compatibilidade com formato antigo

    let attempts = 0;
    let lastError = null;
    while (attempts < 5) {
        try {
            const response = await axios.get(url, {
                timeout,
                validateStatus: function (status) {
                    return true; // Retorna qualquer status para análise
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                maxRedirects: 5 // Permitir redirecionamentos
            });
            // ...existing code...
            // Verificar se houve redirecionamento para URLs suspeitas
            const finalUrl = response.request.res.responseUrl || url;
            const urlAnalysis = analyzeUrl(finalUrl, url);
            // Começar assumindo que está funcionando se o status HTTP for bom
            let isWorking = response.status >= 200 && response.status < 400;
            let additionalInfo = {};
            // Só fazer análise de conteúdo se o status for bom
            if (isWorking) {
                const cheerio = require('cheerio');
                const $ = cheerio.load(response.data);
                const pageAnalysis = analyzePageContent($, response.data, finalUrl);
                // ...existing code...
            }
            return {
                url,
                finalUrl: finalUrl !== url ? finalUrl : undefined,
                status: response.status,
                statusText: response.statusText,
                isWorking,
                responseTime: Date.now(),
                ...additionalInfo,
                ...(linkContext.type && {
                    context: {
                        type: linkContext.type,
                        element: linkContext.element,
                        attribute: linkContext.attribute,
                        text: linkContext.text,
                        selector: linkContext.selector,
                        position: linkContext.position,
                        originalHref: linkContext.originalHref
                    }
                })
            };
        } catch (error) {
            lastError = error;
            if (error.code === 'ECONNABORTED') {
                attempts++;
                continue; // Tenta novamente
            } else {
                break; // Outro erro, não tenta novamente
            }
        }
    }
    // Se chegou aqui, todas as tentativas falharam
    return {
        url,
        status: 0,
        statusText: lastError ? lastError.message : 'Erro desconhecido',
        isWorking: false,
        error: lastError ? lastError.code || 'UNKNOWN_ERROR' : 'UNKNOWN_ERROR',
        ...(linkContext.type && {
            context: {
                type: linkContext.type,
                element: linkContext.element,
                attribute: linkContext.attribute,
                text: linkContext.text,
                selector: linkContext.selector,
                position: linkContext.position,
                originalHref: linkContext.originalHref
            }
        })
    };

        // Verificar se houve redirecionamento para URLs suspeitas
        const finalUrl = response.request.res.responseUrl || url;
        const urlAnalysis = analyzeUrl(finalUrl, url);

        // Começar assumindo que está funcionando se o status HTTP for bom
        let isWorking = response.status >= 200 && response.status < 400;
        let additionalInfo = {};

        // Só fazer análise de conteúdo se o status for bom
        if (isWorking) {
            const cheerio = require('cheerio');
            const $ = cheerio.load(response.data);
            const pageAnalysis = analyzePageContent($, response.data, finalUrl);

            // Só considerar quebrado se houver EVIDÊNCIAS CLARAS de problema:
            // 1. URL é comprovadamente suspeita (redirecionou para erro/busca vazia)
            // 2. Conteúdo tem indicadores específicos de erro
            // 3. Página tem status detectado (404, busca vazia, etc.)

            let hasRealProblem = false;
            let problemReasons = [];

            // Verificar URL suspeita (MUITO mais rigoroso)
            if (urlAnalysis.isSuspicious && urlAnalysis.suspiciousIndicators.length > 0) {
                // Só considerar suspeito se tiver indicadores MUITO específicos de caminhos de erro
                const criticalUrlIndicators = urlAnalysis.suspiciousIndicators.filter(indicator =>
                    indicator.includes('Caminho suspeito: /buscavazia') ||
                    indicator.includes('Caminho suspeito: /search-empty') ||
                    indicator.includes('Caminho suspeito: /no-results') ||
                    indicator.includes('Caminho suspeito: /404') ||
                    indicator.includes('Caminho suspeito: /error') ||
                    indicator.includes('Redirecionou para área de sistema')
                );

                if (criticalUrlIndicators.length > 0) {
                    hasRealProblem = true;
                    problemReasons.push(...criticalUrlIndicators);
                    additionalInfo.urlAnalysis = urlAnalysis;
                }
            }

            // Verificar conteúdo problemático (MUITO mais rigoroso)
            // Só considerar erro se tiver múltiplos indicadores OU indicadores muito específicos
            if (pageAnalysis.hasErrors && pageAnalysis.errorIndicators.length > 0) {
                const realErrors = pageAnalysis.errorIndicators.filter(indicator =>
                    indicator === 'página não encontrada' ||
                    indicator === 'page not found' ||
                    indicator === 'error 404' ||
                    indicator === 'erro 404' ||
                    indicator === 'busca vazia' ||
                    indicator === 'search empty' ||
                    indicator === 'nenhum resultado encontrado' ||
                    indicator === 'no results found' ||
                    indicator.includes('Padrão específico de erro')
                );

                if (realErrors.length > 0) {
                    hasRealProblem = true;
                    problemReasons.push(...realErrors);
                    additionalInfo.pageAnalysis = pageAnalysis;
                }
            }

            // Verificar se é página extremamente vazia (HTML < 200 bytes E sem conteúdo real)
            if (pageAnalysis.isEmpty && response.data.length < 200 && !pageAnalysis.hasRealContent) {
                hasRealProblem = true;
                problemReasons.push('Página extremamente vazia sem conteúdo');
                additionalInfo.pageAnalysis = pageAnalysis;
            }

            // Só marcar como quebrado se tiver problemas reais
            if (hasRealProblem) {
                isWorking = false;
                additionalInfo.reason = `Problemas confirmados: ${problemReasons.join(', ')}`;
            } else {
                // Se chegou até aqui, adicionar análise como informação mas manter como funcionando
                additionalInfo.pageAnalysis = pageAnalysis;
                additionalInfo.urlAnalysis = urlAnalysis;
            }
        }

        return {
            url,
            finalUrl: finalUrl !== url ? finalUrl : undefined,
            status: response.status,
            statusText: response.statusText,
            isWorking,
            responseTime: Date.now(),
            ...additionalInfo,
            // Adicionar informações de contexto se disponíveis
            ...(linkContext.type && {
                context: {
                    type: linkContext.type,
                    element: linkContext.element,
                    attribute: linkContext.attribute,
                    text: linkContext.text,
                    selector: linkContext.selector,
                    position: linkContext.position,
                    originalHref: linkContext.originalHref
                }
            })
        };
    // ...o bloco de retry já trata os erros e retorna o resultado adequado...
}

// Função para analisar se uma URL é suspeita (indicando busca vazia ou erro)
function analyzeUrl(finalUrl, originalUrl) {
    const analysis = {
        isSuspicious: false,
        suspiciousIndicators: [],
        originalUrl,
        finalUrl,
        hasRedirect: false,
        redirectType: ''
    };

    try {
        const url = new URL(finalUrl);
        const path = url.pathname.toLowerCase();
        const search = url.search.toLowerCase();
        const fullUrl = finalUrl.toLowerCase();

        // Verificar se houve redirecionamento
        if (originalUrl !== finalUrl) {
            analysis.hasRedirect = true;
            analysis.suspiciousIndicators.push(`Redirecionamento: ${originalUrl} → ${finalUrl}`);
        }

        // Padrões MUITO específicos que indicam problemas reais - apenas caminhos completos
        const highlySpecificPatterns = [
            // Busca vazia - apenas padrões de caminho completo
            '/buscavazia',
            '/busca-vazia',
            '/busca_vazia',
            '/search-empty',
            '/search_empty',
            '/empty-search',
            '/empty_search',
            '/no-results',
            '/no_results',
            '/sem-resultado',
            '/sem_resultado',
            '/resultado-vazio',
            '/resultado_vazio',

            // Erros 404 específicos - apenas arquivos/caminhos de erro
            '/page-not-found',
            '/page_not_found',
            '/pagina-nao-encontrada',
            '/pagina_nao_encontrada',
            '/notfound',
            '/404.html',
            '/404.php',
            '/404/',

            // Erros de sistema específicos - apenas caminhos de erro
            '/erro/',
            '/error/',
            '/internal-error',
            '/server-error',
            '/service-unavailable',
            '/manutencao.html',
            '/maintenance.html',
            '/offline.html',

            // Acesso negado específico - apenas caminhos
            '/access-denied',
            '/access_denied',
            '/acesso-negado',
            '/acesso_negado',
            '/forbidden.html',
            '/unauthorized.html'
        ];

        // Verificar padrões APENAS no caminho da URL (não em toda URL)
        for (const pattern of highlySpecificPatterns) {
            if (path.includes(pattern)) {
                analysis.isSuspicious = true;
                analysis.suspiciousIndicators.push(`Caminho suspeito: ${pattern}`);
            }
        }

        // Verificar redirecionamentos suspeitos
        if (analysis.hasRedirect) {
            const originalPath = new URL(originalUrl).pathname.toLowerCase();
            const finalPath = path;

            // Se redirecionou para pasta de sistema/erro
            const systemPaths = ['/sistema/', '/system/', '/error/', '/erro/', '/admin/', '/login/', '/auth/'];
            for (const sysPath of systemPaths) {
                if (finalPath.includes(sysPath) && !originalPath.includes(sysPath)) {
                    analysis.isSuspicious = true;
                    analysis.redirectType = 'sistema';
                    analysis.suspiciousIndicators.push(`Redirecionou para área de sistema: ${sysPath}`);
                }
            }

            // Se redirecionou de página específica para página genérica
            if (originalPath.length > 10 && finalPath.length < 5) {
                analysis.suspiciousIndicators.push('Redirecionou para página genérica');
            }
        }

        // Verificar parâmetros de query muito específicos
        const params = url.searchParams;
        const suspiciousParams = [
            'error', 'erro', 'empty', 'vazio', 'fail', 'falha',
            'notfound', 'naoenccontrado', 'invalid', 'invalido',
            'timeout', 'expired', 'expirado', 'denied', 'negado'
        ];

        for (const param of suspiciousParams) {
            if (params.has(param)) {
                analysis.isSuspicious = true;
                analysis.suspiciousIndicators.push(`Parâmetro suspeito: ${param}=${params.get(param)}`);
            }
        }

        // Verificar estrutura de URL suspeita
        const suspiciousUrlStructures = [
            /\/\d+\/error/i,           // /123/error
            /\/erro\/\d+/i,           // /erro/123  
            /buscavazia/i,            // qualquer buscavazia
            /search.*empty/i,         // search...empty
            /no.*result/i,            // no-result, noresult
            /page.*not.*found/i,      // page-not-found
            /\/404\//i,               // /404/
            /\/erro\//i,              // /erro/
            /\/error\//i              // /error/
        ];

        for (const structure of suspiciousUrlStructures) {
            if (structure.test(fullUrl)) {
                analysis.isSuspicious = true;
                analysis.suspiciousIndicators.push(`Estrutura de URL suspeita: ${structure.source}`);
            }
        }

    } catch (error) {
        // Se não conseguir analisar a URL, não é necessariamente suspeito
        analysis.suspiciousIndicators.push(`Erro na análise de URL: ${error.message}`);
    }

    return analysis;
}

// Função para analisar se uma página tem conteúdo útil
function analyzePageContent($, html, finalUrl = '') {
    const analysis = {
        isEmpty: false,
        hasErrors: false,
        title: '',
        textContent: '',
        contentLength: 0,
        hasImages: false,
        hasLinks: false,
        errorIndicators: [],
        finalUrl,
        hasRealContent: false,
        statusPageDetected: false
    };

    try {
        // Extrair título
        analysis.title = $('title').text().trim() || $('h1').first().text().trim() || 'Sem título';

        // Extrair conteúdo de texto visível (removendo scripts e styles)
        const textContent = $('body').clone()
            .find('script, style, noscript, header, nav, footer').remove().end()
            .text().replace(/\s+/g, ' ').trim();

        analysis.textContent = textContent.substring(0, 300); // Mais caracteres para análise
        analysis.contentLength = textContent.length;

        // Verificar se tem imagens e links úteis
        analysis.hasImages = $('img').length > 0;
        analysis.hasLinks = $('a[href]').length > 0;

        // Verificar se tem conteúdo real (parágrafos, divs com texto, listas)
        const realContentElements = $('p, div, li, article, section').filter(function () {
            return $(this).text().trim().length > 20; // Pelo menos 20 caracteres
        });
        analysis.hasRealContent = realContentElements.length > 0;

        // Indicadores MUITO específicos de erro/busca vazia
        const criticalErrorIndicators = [
            // Páginas 404 - apenas textos muito específicos
            'página não encontrada',
            'page not found',
            'arquivo não encontrado',
            'file not found',
            'error 404',
            'erro 404',
            '404 not found',
            '404 - not found',

            // Busca vazia específica - apenas textos completos
            'busca vazia',
            'search empty',
            'no results found',
            'nenhum resultado encontrado',
            'sua busca não retornou resultados',
            'não foram encontrados resultados',
            'no matching results were found',

            // Erros de sistema específicos
            'internal server error',
            'erro interno do servidor',
            'service unavailable',
            'serviço indisponível',
            'bad gateway',
            'gateway timeout',

            // Acesso negado específico
            'access denied',
            'acesso negado',
            'forbidden',
            'unauthorized',
            'não autorizado'
        ];

        const lowerTitle = analysis.title.toLowerCase();
        const lowerContent = textContent.toLowerCase();

        // Só marcar como erro se tiver indicadores muito específicos E completos
        for (const indicator of criticalErrorIndicators) {
            // Verificar se o indicador aparece como frase completa, não apenas palavra isolada
            const indicatorRegex = new RegExp(`\\b${indicator.replace(/\s+/g, '\\s+')}\\b`, 'i');
            if (indicatorRegex.test(lowerTitle) || indicatorRegex.test(lowerContent)) {
                analysis.hasErrors = true;
                analysis.errorIndicators.push(indicator);
            }
        }

        // Detectar páginas de status específicas - MUITO mais rigoroso
        const statusPagePatterns = [
            // Apenas padrões muito específicos para 404
            /^404$/i,                           // Apenas "404" sozinho
            /^erro\s+404$/i,                   // "erro 404"
            /^error\s+404$/i,                  // "error 404"
            /\b404\s+not\s+found\b/i,         // "404 not found"
            /\bpage\s+not\s+found\b/i,        // "page not found"
            /\bpágina\s+não\s+encontrada\b/i, // "página não encontrada"

            // Apenas padrões específicos para busca vazia
            /\bbusca\s+vazia\b/i,             // "busca vazia"
            /\bsearch\s+empty\b/i,            // "search empty"
            /\bnenhum\s+resultado\s+encontrado\b/i, // "nenhum resultado encontrado"
            /\bno\s+results\s+found\b/i       // "no results found"
        ];

        for (const pattern of statusPagePatterns) {
            if (pattern.test(lowerTitle) || pattern.test(lowerContent)) {
                analysis.statusPageDetected = true;
                analysis.hasErrors = true;
                analysis.errorIndicators.push(`Padrão específico de erro: ${pattern.source}`);
            }
        }

        // Critérios MUITO mais rigorosos para considerar página vazia
        // Só considerar vazia se:
        // 1. TEM indicadores de erro OU
        // 2. HTML é extremamente pequeno (< 300 bytes) OU  
        // 3. Não tem conteúdo real E tem menos de 30 caracteres de texto
        if (analysis.hasErrors ||
            html.length < 300 ||
            (!analysis.hasRealContent && analysis.contentLength < 30)) {
            analysis.isEmpty = true;
        }

        // Se tem mais de 500 caracteres de conteúdo real, definitivamente não está vazia
        if (analysis.contentLength > 500 && analysis.hasRealContent) {
            analysis.isEmpty = false;
        }

    } catch (error) {
        analysis.hasErrors = true;
        analysis.errorIndicators.push(`Erro na análise: ${error.message}`);
    }

    return analysis;
}

// Função para extrair todos os links de uma página com contexto detalhado
async function extractLinks(url) {
    try {
        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const linksMap = new Map(); // Usar Map para armazenar detalhes
        const baseUrl = new URL(url);

        // Verificar se a página tem conteúdo útil
        const pageAnalysis = analyzePageContent($, response.data, url);

        // Se a página está vazia ou tem problemas, adicionar como link quebrado
        if (pageAnalysis.isEmpty || pageAnalysis.hasErrors) {
            const pageContext = {
                url: url,
                type: 'page',
                element: 'html',
                attribute: 'page',
                text: pageAnalysis.title || 'Página principal',
                selector: 'html',
                position: 0,
                originalHref: url,
                pageInfo: pageAnalysis
            };
            linksMap.set(`${url}#page-analysis`, pageContext);
        }

        // Extrair links de <a href=""> com contexto
        $('a[href]').each((i, element) => {
            const href = $(element).attr('href');
            if (href) {
                // Ignorar links âncora (começam com #) e links vazios
                if (href.startsWith('#') || href.trim() === '') {
                    return;
                }

                try {
                    // Detectar protocolos especiais que não devem ser verificados
                    const specialProtocols = ['tel:', 'mailto:', 'sms:', 'whatsapp:', 'skype:', 'viber:', 'telegram:', 'vtex:', 'javascript:', 'data:'];
                    const isSpecialProtocol = specialProtocols.some(protocol => href.toLowerCase().startsWith(protocol));

                    if (isSpecialProtocol) {
                        // Adicionar como link especial sem verificação
                        const linkText = $(element).text().trim() || 'Link especial';
                        const context = {
                            url: href,
                            type: 'special',
                            element: 'a',
                            attribute: 'href',
                            text: linkText.substring(0, 100),
                            selector: getSelector($, element),
                            position: i + 1,
                            originalHref: href,
                            protocol: href.split(':')[0]
                        };
                        linksMap.set(href, context);
                        return;
                    }

                    const fullUrl = new URL(href, baseUrl.origin);

                    // Ignorar se a URL final contém âncora
                    if (fullUrl.hash) {
                        // Remover a âncora da URL para verificação
                        fullUrl.hash = '';
                    }

                    const linkText = $(element).text().trim() || 'Link sem texto';
                    const context = {
                        url: fullUrl.href,
                        type: 'link',
                        element: 'a',
                        attribute: 'href',
                        text: linkText.substring(0, 100), // Limitar tamanho
                        selector: getSelector($, element),
                        position: i + 1,
                        originalHref: href
                    };
                    linksMap.set(fullUrl.href, context);
                } catch (e) {
                    // Ignorar URLs inválidas
                }
            }
        });

        // Extrair links de imagens com contexto
        $('img[src]').each((i, element) => {
            const src = $(element).attr('src');
            if (src) {
                try {
                    const fullUrl = new URL(src, baseUrl.origin);
                    const alt = $(element).attr('alt') || 'Imagem sem alt';
                    const context = {
                        url: fullUrl.href,
                        type: 'image',
                        element: 'img',
                        attribute: 'src',
                        text: alt.substring(0, 100),
                        selector: getSelector($, element),
                        position: i + 1,
                        originalHref: src
                    };
                    linksMap.set(fullUrl.href, context);
                } catch (e) {
                    // Ignorar URLs inválidas
                }
            }
        });

        // Extrair links de CSS
        $('link[href]').each((i, element) => {
            const href = $(element).attr('href');
            if (href) {
                try {
                    const fullUrl = new URL(href, baseUrl.origin);
                    const rel = $(element).attr('rel') || 'stylesheet';
                    const context = {
                        url: fullUrl.href,
                        type: 'stylesheet',
                        element: 'link',
                        attribute: 'href',
                        text: `CSS: ${rel}`,
                        selector: getSelector($, element),
                        position: i + 1,
                        originalHref: href
                    };
                    linksMap.set(fullUrl.href, context);
                } catch (e) {
                    // Ignorar URLs inválidas
                }
            }
        });

        // Extrair links de JavaScript
        $('script[src]').each((i, element) => {
            const src = $(element).attr('src');
            if (src) {
                try {
                    const fullUrl = new URL(src, baseUrl.origin);
                    const type = $(element).attr('type') || 'text/javascript';
                    const context = {
                        url: fullUrl.href,
                        type: 'script',
                        element: 'script',
                        attribute: 'src',
                        text: `JS: ${type}`,
                        selector: getSelector($, element),
                        position: i + 1,
                        originalHref: src
                    };
                    linksMap.set(fullUrl.href, context);
                } catch (e) {
                    // Ignorar URLs inválidas
                }
            }
        });

        return Array.from(linksMap.values());
    } catch (error) {
        throw new Error(`Erro ao extrair links: ${error.message}`);
    }
}

// Função auxiliar para gerar seletor CSS único
function getSelector($, element) {
    try {
        const tagName = element.tagName.toLowerCase();
        const id = $(element).attr('id');
        const className = $(element).attr('class');

        if (id) {
            return `${tagName}#${id}`;
        }

        if (className) {
            const classes = className.split(' ').filter(c => c.trim()).slice(0, 2);
            return `${tagName}.${classes.join('.')}`;
        }

        // Fallback: posição relativa ao parent
        const parent = $(element).parent();
        const siblings = parent.children(tagName);
        const index = siblings.index(element);

        if (parent.length && parent[0].tagName) {
            const parentTag = parent[0].tagName.toLowerCase();
            return `${parentTag} > ${tagName}:nth-child(${index + 1})`;
        }

        return tagName;
    } catch (e) {
        return 'unknown';
    }
}// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para verificar links
app.post('/api/check-links', async (req, res) => {
    const { url, checkExternal = false, maxLinks = 50 } = req.body;

    if (!url || !isValidUrl(url)) {
        return res.status(400).json({
            error: 'URL inválida. Por favor, forneça uma URL válida.'
        });
    }

    try {
        console.log(`Iniciando verificação para: ${url}`);

        // Extrair todos os links da página com contexto
        const allLinksWithContext = await extractLinks(url);
        console.log(`Encontrados ${allLinksWithContext.length} links`);

        // Filtrar links se necessário
        let linksToCheck = allLinksWithContext;
        const baseUrl = new URL(url);

        if (!checkExternal) {
            linksToCheck = allLinksWithContext.filter(linkContext => {
                try {
                    const linkUrl = new URL(linkContext.url);
                    return linkUrl.hostname === baseUrl.hostname;
                } catch (e) {
                    return false;
                }
            });
        }

        // Limitar número de links para evitar sobrecarga (apenas se maxLinks não for null/ilimitado)
        if (maxLinks !== null && linksToCheck.length > maxLinks) {
            linksToCheck = linksToCheck.slice(0, maxLinks);
        }

        console.log(`Verificando ${linksToCheck.length} links${maxLinks === null ? ' (ILIMITADO)' : ''}`);

        // Verificar links em lotes para não sobrecarregar
        const batchSize = 10;
        const results = [];

        for (let i = 0; i < linksToCheck.length; i += batchSize) {
            const batch = linksToCheck.slice(i, i + batchSize);
            const batchPromises = batch.map(linkContext => checkLink(linkContext));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // Pequena pausa entre lotes
            if (i + batchSize < linksToCheck.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Organizar resultados
        const workingLinks = results.filter(r => r.isWorking);
        const brokenLinks = results.filter(r => !r.isWorking);

        const report = {
            url,
            timestamp: new Date().toISOString(),
            totalLinksFound: allLinksWithContext.length,
            totalLinksChecked: results.length,
            workingLinks: workingLinks.length,
            brokenLinks: brokenLinks.length,
            checkExternal,
            maxLinksUsed: maxLinks,
            details: {
                working: workingLinks,
                broken: brokenLinks
            }
        };

        console.log(`Verificação concluída: ${workingLinks.length} funcionando, ${brokenLinks.length} quebrados`);

        res.json(report);

    } catch (error) {
        console.error('Erro na verificação:', error);
        res.status(500).json({
            error: `Erro ao processar a URL: ${error.message}`
        });
    }
});

// Rota para verificar um link específico
app.post('/api/check-single-link', async (req, res) => {
    const { url } = req.body;

    if (!url || !isValidUrl(url)) {
        return res.status(400).json({
            error: 'URL inválida'
        });
    }

    try {
        const result = await checkLink(url);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🤖 Robô de Verificação de Links rodando em http://localhost:${PORT}`);
});

module.exports = app;