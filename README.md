# 🤖 Robô Verificador de Links

Um sistema web inteligente para verificar links quebrados em websites, com interface responsiva e sistema de favoritos.

## 🌟 Funcionalidades

- ✅ **Verificação de Links**: Analisa websites e detecta links quebrados
- 💖 **Sistema de Favoritos**: Salve e organize seus sites favoritos
- 🏷️ **Filtros por Grupo**: Organize sites por categorias
- 📱 **Interface Responsiva**: Funciona perfeitamente em desktop e mobile
- 🔄 **Verificação em Lote**: Verifique todos os favoritos de uma vez
- 📊 **Relatórios Detalhados**: Visualize estatísticas completas
- 💾 **Persistência Local**: Dados salvos no navegador

## 🚀 Como usar

### 1. **Verificação Simples**

- Digite a URL do site
- Clique em "Verificar Links"
- Visualize o relatório completo

### 2. **Sistema de Favoritos**

- Adicione sites aos favoritos
- Organize em grupos (Trabalho, Pessoal, etc.)
- Verifique links rapidamente

### 3. **Filtros e Busca**

- Filtre por grupos específicos
- Use subfiltros (OK, Erro, Verificando)
- Botão "Verificar Todos" respeitando filtros

## 🛠️ Tecnologias

### **Frontend**

- HTML5 + CSS3
- JavaScript ES6+
- Bootstrap 5.3.0
- Font Awesome 6.0.0

### **Backend**

- Node.js
- Express.js
- Axios (requisições HTTP)
- Cheerio (parser HTML)

## 📦 Instalação

### **Requisitos**

- Node.js 14+
- npm ou yarn

### **Passos**

```bash
# 1. Clone ou baixe os arquivos
# 2. Instale as dependências
npm install

# 3. Inicie o servidor
npm start

# 4. Acesse no navegador
http://localhost:3000
```

## 🌐 Deploy em Produção

### **Estrutura de Arquivos**

```
robo-site/
├── package.json          # Dependências
├── package-lock.json     # Lock das versões
├── server.js             # Servidor Node.js
└── public/
    ├── index.html        # Interface principal
    ├── script.js         # Lógica da aplicação
    └── styles.css        # Estilos responsivos
```

### **Opções de Hospedagem**

#### **1. VPS/Servidor Próprio**

```bash
# Upload dos arquivos + execute:
npm install
npm start
```

#### **2. Plataformas Gratuitas** (Render, Railway, Heroku)

- Faça upload dos arquivos
- A plataforma instala dependências automaticamente
- Executa com `npm start`

#### **3. Hospedagem Estática** (Netlify, Vercel)

- Upload apenas da pasta `public/`
- Configure API externa para verificação
- Modifique URLs no `script.js`

## 🔧 Configuração

### **Porta do Servidor**

```javascript
// server.js - linha ~510
const PORT = process.env.PORT || 3000;
```

### **Limites de Verificação**

```javascript
// script.js - opções de maxLinks
const maxLinksOptions = [10, 25, 50, 100, "unlimited"];
```

### **Timeout de Requisições**

```javascript
// server.js - configuração axios
timeout: 10000; // 10 segundos
```

## 📱 Design Responsivo

### **Breakpoints**

- **Desktop**: 1200px+
- **Tablet**: 768px - 1199px
- **Mobile**: < 768px

### **Funcionalidades Mobile**

- Header sticky em telas pequenas
- Sidebar colapsável
- Botões otimizados para toque
- Layout em coluna única

## 🎨 Customização

### **Cores (CSS Variables)**

```css
:root {
  --primary-color: #2563eb;
  --success-color: #22c55e;
  --danger-color: #ef4444;
  --warning-color: #f59e0b;
}
```

### **Grupos de Favoritos**

```javascript
// script.js - adicione novos grupos
const groupOptions = [
  "trabalho",
  "pessoal",
  "estudos",
  "projetos",
  "referencias",
  "tools",
];
```

## 🔍 API Endpoints

### **Verificar URL**

```
POST /check-links
Body: { url: "https://exemplo.com", maxLinks: 50 }
```

### **Servir Arquivos Estáticos**

```
GET / - Interface principal
GET /script.js - Lógica da aplicação
GET /styles.css - Estilos CSS
```

## 🐛 Troubleshooting

### **Erro: Cannot find module**

- Certifique-se que está no diretório correto
- Execute `npm install`

### **Porta já em uso**

- Mude a porta no `server.js`
- Use `PORT=3001 npm start`

### **CORS Error**

- Verificação configurada no servidor
- Não funciona em file:// (precisa de servidor)

## 📊 Performance

### **Otimizações Implementadas**

- Timeout de 10s por requisição
- Limite configurável de links
- Cache de verificações no localStorage
- Carregamento assíncrono
- Debounce nos filtros

### **Limites Recomendados**

- **Sites pequenos**: 50 links
- **Sites médios**: 100 links
- **Sites grandes**: Modo ilimitado (cuidado!)

## 📄 Licença

MIT License - Use livremente em projetos pessoais e comerciais.

## 🤝 Contribuições

Desenvolvido para verificação eficiente de links quebrados.

**Principais recursos:**

- Interface intuitiva e responsiva
- Sistema robusto de verificação
- Organização inteligente de favoritos
- Relatórios detalhados e úteis

---

**🚀 Pronto para usar!** Faça o deploy e comece a verificar seus links hoje mesmo.
