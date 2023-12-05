document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('form');

    form.addEventListener('submit', function (event) {
        let isValid = true;

        // Função para exibir alerta e impedir o envio do formulário
        function showAlert(message) {
            isValid = false;
            alert(message);
        }

        // Validar o campo Nome
        const usernameInput = document.getElementById('username');
        if (usernameInput.value.trim() === '') {
            showAlert('Por favor, preencha o campo Nome.');
        }

        // Validar o campo Password
        const passwordInput = document.getElementById('password');
        if (passwordInput.value.trim() === '') {
            showAlert('Por favor, preencha o campo Password.');
        }

        // Validar o campo Repetir Senha
        const confirmPasswordInput = document.getElementById('confirmPassword');
        if (confirmPasswordInput.value.trim() === '') {
            showAlert('Por favor, preencha o campo Repetir Senha.');
        } else if (passwordInput.value.trim() !== confirmPasswordInput.value.trim()) {
            showAlert('As senhas não coincidem.');
        }

        // Validar o campo E-mail
        const emailInput = document.getElementById('email');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailInput.value.trim())) {
            showAlert('Por favor, insira um endereço de e-mail válido.');
        }

        // Validar o campo Endereço
        const addressInput = document.getElementById('address');
        if (addressInput.value.trim() === '') {
            showAlert('Por favor, preencha o campo Endereço.');
        }

        if (!isValid) {
            event.preventDefault(); // Impede o envio do formulário se não for válido
        }
    });
});
