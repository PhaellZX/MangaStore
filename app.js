const express = require("express");
const app = express();
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const User = require('./models/user');
const Obra = require('./models/obras');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const flash = require('connect-flash');
const fs = require('fs');

// Função para carregar dados de um arquivo JSON para o banco de dados
const carregarDados = async (nomeDoArquivo, Modelo) => {
    try {
      const dados = JSON.parse(fs.readFileSync(nomeDoArquivo, 'utf-8'));
      await Modelo.insertMany(dados);
      console.log(`Dados do arquivo ${nomeDoArquivo} carregados com sucesso.`);
    } catch (error) {
      console.error(`Erro ao carregar dados do arquivo ${nomeDoArquivo}: ${error}`);
    }
  };

//Windows 10
//mongoose.connect("mongodb://localhost/dbLojaCamisetas", {useNewUrlParser: true, useUnifiedTopology: true})
//Windows 11
mongoose.connect("mongodb://127.0.0.1/mangastore")
  .then(() => {
    console.log('Conexão estabelecida com o banco!');
    
    // Carregar dados para as coleções obras e users
    carregarDados('mangastore.obras.json', Obra);
    carregarDados('mangastore.admin.json', User);
  })
  .catch(err => {
    console.log("Erro ao conectar com o banco:" + err);
  });


app.use(flash());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({extended: true}));

app.use(session({secret:'meu_segredo...', resave: false, saveUninitialized: true}));

app.use(passport.initialize()); 
app.use(passport.session()); 

passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
    // Define quantidadeCarrinho mesmo se o usuário não estiver autenticado
    req.session.quantidadeCarrinho = req.session.quantidadeCarrinho || 0;

    res.locals.currentUser = req.user;
    res.locals.quantidadeCarrinho = req.session.quantidadeCarrinho;
    next();
});

const isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    req.session.returnTo = req.originalUrl;

    // Verifique se a URL de retorno é relacionada ao carrinho, se sim, redirecione para /login
    if (req.originalUrl.includes('/carrinho')) {
        return res.redirect("/login");
    }
    res.redirect("/"); 
};

app.get('/produto/:id', async (req, res) => {
    try {
        const obra = await Obra.findById(req.params.id);
        res.render('produto', { obra, quantidadeCarrinho: req.session.quantidadeCarrinho });
    } catch (error) {
        console.error('Erro ao recuperar obra:', error);
        res.redirect('/'); 
    }
});

app.get('/cadastro', (req, res) => {
    res.render('cadastro', { quantidadeCarrinho: req.session.quantidadeCarrinho, errorMessage: req.query.errorMessage });
});

app.post('/cadastro', async (req, res, next) => {
    try {
        const { username, password, email, address } = req.body;

        // Verifique se o email já existe
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            // Se o email já existe, redirecione de volta para o formulário com uma mensagem de erro
            const errorMessage = 'E-mail já cadastrado. Por favor, escolha outro e-mail.';
            return res.redirect(`/cadastro?errorMessage=${encodeURIComponent(errorMessage)}`);
        }

        // Verifique se o nome de usuário já existe
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            // Se o nome de usuário já existe, redirecione de volta para o formulário com uma mensagem de erro
            const errorMessage = 'Nome de usuário já existe. Por favor, escolha outro nome de usuário.';
            return res.redirect(`/cadastro?errorMessage=${encodeURIComponent(errorMessage)}`);
        }

        // Se o email e o nome de usuário não existem, continue com o cadastro
        const usuario = new User({ username, email, address });

        // Tente cadastrar o usuário
        const usuarioRegistrado = await User.register(usuario, password);

        // Redirecione para a página home com a mensagem de sucesso
        const successMessage = 'Cadastro realizado com sucesso! Faça o login para continuar.';
        res.redirect(`/?successMessage=${encodeURIComponent(successMessage)}`);
    } catch (e) {
        // Trate outros erros e redirecione conforme necessário
        console.error(e);
        res.redirect('/');  // Redirecione para uma página de erro, se necessário
    }
});


app.post('/login', passport.authenticate("local", { failureRedirect: "/login", failureFlash: true }), (req, res) => {
    const redirectUrl = req.session.returnTo || "/";
    delete req.session.returnTo;
    res.redirect(redirectUrl);
});

app.get('/login', (req, res) => {
    // Pass any flash messages to the login template
    res.render('login', { quantidadeCarrinho: req.session.quantidadeCarrinho, errorMessage: req.flash('error') });
});


app.get('/logout', async (req, res) => {
    try {
        // Check if the carrinhoItens is defined in the session
        if (req.session.carrinhoItens) {
            // Iterate through the items in the shopping cart
            for (const carrinhoItem of req.session.carrinhoItens) {
                const obraId = carrinhoItem.obra._id;
                const quantidadeDevolvida = carrinhoItem.quantidade;

                // Increment the stock of each product
                const obra = await Obra.findById(obraId);
                obra.estoque += quantidadeDevolvida;
                await obra.save();
            }

            // Clear the shopping cart session variables
            req.session.carrinhoItens = [];
            req.session.quantidadeCarrinho = 0;
        }

        req.logout();
        res.redirect("/");
    } catch (error) {
        console.error(`Erro durante o logout: ${error}`);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/carrinho/:id', async (req, res) => {
    const obraId = req.params.id;
    const { quantidade } = req.body;

    if (!quantidade || quantidade <= 0) {
        return res.status(400).json({ error: 'Quantidade inválida' });
    }

    try {
        const obra = await Obra.findById(obraId);

        if (!obra) {
            return res.status(404).json({ error: `Obra com ID ${obraId} não encontrada.` });
        }

        if (quantidade > obra.estoque) {
            return res.status(400).json({ error: 'Quantidade excede o estoque disponível' });
        }

        // Adicionar obra ao carrinho do usuário ou à sessão se não estiver logado
        const carrinhoItem = {
            obra,
            quantidade: parseInt(quantidade),
        };

        if (req.isAuthenticated()) {
            // User is logged in
            if (!req.session.carrinhoItens) {
                req.session.carrinhoItens = [];
            }
            req.session.carrinhoItens.push(carrinhoItem);

            // Atualizar o carrinho no banco de dados
            await User.findByIdAndUpdate(req.user._id, { carrinhoItens: req.session.carrinhoItens }, { new: true });
        } else {
            // User is not logged in
            if (!req.session.carrinhoItens) {
                req.session.carrinhoItens = [];
                req.session.quantidade = 0;
            }
            req.session.carrinhoItens.push(carrinhoItem);
        }

        // Atualizar o estoque da obra
        obra.estoque -= quantidade;
        await obra.save();

        // Atualizar a quantidade no navbar
        req.session.quantidadeCarrinho = req.session.carrinhoItens.reduce((acc, item) => acc + item.quantidade, 0);

        // Redirecionar para a página do carrinho após a adição
        res.redirect('/carrinho');
    } catch (error) {
        console.error(`Erro ao adicionar obra ao carrinho: ${error}`);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});


app.get('/carrinho/:id', isLoggedIn, (req, res) => {    
    const carrinhoItens = req.session.carrinhoItens || [];
    const total = carrinhoItens.reduce((acc, item) => acc + item.quantidade * item.obra.preco, 0);

    res.render('carrinho', { carrinhoItens, total });
});

app.get('/carrinho', isLoggedIn, (req, res) => {
    const carrinhoItens = req.session.carrinhoItens || [];
    const total = carrinhoItens.reduce((acc, item) => acc + item.quantidade * item.obra.preco, 0);

    res.render('carrinho', { carrinhoItens, total });
});

// Rota para remover um item do carrinho
app.post('/carrinho/remover/:id', isLoggedIn, async (req, res) => {
    const obraId = req.params.id;

    try {
        // Verifique se o carrinhoItens está definido na sessão
        if (!req.session.carrinhoItens) {
            return res.status(400).json({ error: 'O carrinho está vazio.' });
        }

        // Encontre o índice do item no carrinhoItens
        const index = req.session.carrinhoItens.findIndex(item => item.obra._id === obraId);

        // Remova o item do carrinhoItens
        if (index !== -1) {
            // Devolva a quantidade ao estoque
            const quantidadeRemovida = req.session.carrinhoItens[index].quantidade;
            const obra = await Obra.findById(obraId);
            obra.estoque += quantidadeRemovida;
            await obra.save();

            req.session.carrinhoItens.splice(index, 1);

            // Atualize a quantidade do carrinho na sessão
            req.session.quantidadeCarrinho = req.session.carrinhoItens.length;

            // Atualize o carrinho no banco de dados, se desejar persistir os dados do carrinho
            await User.findByIdAndUpdate(req.user._id, { carrinhoItens: req.session.carrinhoItens });

            // Redirecione de volta para a página do carrinho após a remoção
            res.redirect('/carrinho');
        } else {
            res.status(404).json({ error: 'Item não encontrado no carrinho.' });
        }
    } catch (error) {
        console.error(`Erro ao remover item do carrinho: ${error}`);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});


app.post('/confirmacao', (req, res) => {
    try {
        // Obtenha os detalhes do carrinho da sessão
        const carrinhoItens = req.session.carrinhoItens || [];
        const total = carrinhoItens.reduce((acc, item) => acc + item.quantidade * item.obra.preco, 0);

        // Redirecione para a página de confirmação com os detalhes do carrinho
        res.render('confirmacao', { carrinhoItens, total });

        // Remova todos os itens do carrinho da sessão após a compra
        req.session.carrinhoItens = [];
    } catch (error) {
        console.error(`Erro na rota /confirmacao: ${error}`);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/finalizar', (req, res) => {
    try {
        // Remova todos os itens do carrinho da sessão após a compra
        req.session.carrinhoItens = [];
        req.session.quantidadeCarrinho = 0;

        // Redirecione para a página de confirmação
        res.redirect('/?compraSucesso=true');
    } catch (error) {
        console.error(`Erro na rota /finalizar: ${error}`);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/', async (req, res) => {
    try {
        const obras = await Obra.find();
        res.render('home', { 
            obras,
            quantidadeCarrinho: req.session.quantidadeCarrinho,
            successMessage: req.query.successMessage  // Inclua a mensagem de sucesso da consulta
        });
    } catch (error) {
        console.error('Erro ao recuperar obras:', error);
        res.render('home', { 
            obras: [],
            quantidadeCarrinho: req.session.quantidadeCarrinho,
            successMessage: req.query.successMessage  // Inclua a mensagem de sucesso da consulta
        });
    }
});


// Rota para a página de catálogo
app.get('/catalogo', async (req, res) => {
    try {
        const obras = await Obra.find();
        res.render('catalogo', { obras, quantidadeCarrinho: req.session.quantidadeCarrinho });
    } catch (error) {
        console.error('Erro ao recuperar obras:', error);
        res.render('catalogo', { obras: [], quantidadeCarrinho: req.session.quantidadeCarrinho });
    }
});

// ADMINISTRADOR

// Middleware para verificar se o cliente é admin1452
const verificarAdmin = (req, res, next) => {
    // Substitua "admin1452" pelo nome do cliente permitido
    const clientePermitido = "admin5264273";

    // Verifica se o usuário está autenticado e se o username é "admin1452"
    if (req.isAuthenticated() && req.user.username === clientePermitido) {
        return next();
    } else {
        res.render('block', { quantidadeCarrinho: req.session.quantidadeCarrinho });
    }
};

app.get('/admin', verificarAdmin, async (req, res) => {
    const obras = await Obra.find();
    res.render('admin', { obras });
});

app.get('/obra/create', verificarAdmin, async (req, res) => {
    res.render('create');
  });
  
  app.post('/obra/create', verificarAdmin, async (req, res) => {
    const { nome, preco, imagemURL, estoque } = req.body;
    const obra = new Obra({ nome, preco, imagemURL, estoque }); // Adicionando o campo "estoque"
    await obra.save();
    res.redirect('/admin');
  });
  
  app.get('/obra/edit/:id', verificarAdmin, async (req, res) => {
    const obra = await Obra.findById(req.params.id);
    res.render('edit', { obra });
  });
  
  app.post('/obra/edit/:id', verificarAdmin, async (req, res) => {
    const { nome, preco, imagemURL, estoque } = req.body;
    await Obra.findByIdAndUpdate(req.params.id, { nome, preco, imagemURL, estoque }); // Adicionando o campo "estoque"
    res.redirect('/admin');
  });
  
  app.get('/obra/delete/:id', verificarAdmin, async (req, res) => {
    await Obra.findByIdAndDelete(req.params.id);
    res.redirect('/admin');
  });

app.listen(3000, () => {
    console.log("Servidor ligado na porta 3000!");
});

