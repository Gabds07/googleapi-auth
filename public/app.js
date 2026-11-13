const elements = {
    loginView: document.querySelector("#login-view"),
    accountView: document.querySelector("#account-view"),
    buttonHost: document.querySelector("#google-button"),
    notice: document.querySelector("#notice"),
    noticeText: document.querySelector("#notice-text"),
    logoutButton: document.querySelector("#logout-button"),
    profilePicture: document.querySelector("#profile-picture"),
    profileInitial: document.querySelector("#profile-initial"),
    profileName: document.querySelector("#profile-name"),
    profileEmail: document.querySelector("#profile-email"),
};

let googleClientId = null;
let csrfToken = null;
let gisScriptPromise = null;
let loginInProgress = false;

function setNotice(message, kind = "info") {
    elements.notice.hidden = false;
    elements.notice.dataset.kind = kind;
    elements.noticeText.textContent = message;
}

function clearNotice() {
    elements.notice.hidden = true;
    elements.noticeText.textContent = "";
    delete elements.notice.dataset.kind;
}

async function apiRequest(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let response;
    try {
        response = await fetch(url, {
            ...options,
            headers,
            cache: "no-store",
            credentials: "same-origin",
        });
    } catch {
        throw new Error(
            "Não foi possível falar com o servidor. Verifique a conexão e tente novamente.",
        );
    }

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(
            "O servidor retornou uma resposta inesperada. Tente novamente.",
        );
    }
    if (!response.ok) {
        const error = new Error(
            data?.error?.message || "Não foi possível concluir a solicitação.",
        );
        error.code = data?.error?.code;
        error.status = response.status;
        throw error;
    }
    return data;
}

function loadGoogleIdentityServices() {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (gisScriptPromise) return gisScriptPromise;

    gisScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = () => {
            if (window.google?.accounts?.id) resolve();
            else
                reject(
                    new Error(
                        "O serviço de login do Google não ficou disponível.",
                    ),
                );
        };
        script.onerror = () =>
            reject(
                new Error(
                    "Não foi possível carregar o login do Google. Verifique a conexão.",
                ),
            );
        document.head.append(script);
    });

    return gisScriptPromise;
}

function showLoggedOut() {
    csrfToken = null;
    elements.accountView.hidden = true;
    elements.loginView.hidden = false;
    elements.profilePicture.hidden = true;
    elements.profilePicture.removeAttribute("src");
    elements.profileInitial.hidden = false;
}

function showLoggedIn(user, token) {
    csrfToken = token;
    elements.profileName.textContent = user.name || "Conta Google";
    elements.profileEmail.textContent = user.email || "E-mail não informado";
    const initial =
        (user.name || user.email || "G")
            .trim()
            .charAt(0)
            .toLocaleUpperCase("pt-BR") || "G";
    elements.profileInitial.textContent = initial;

    let pictureUrl = null;
    try {
        const candidate = new URL(user.picture);
        if (
            candidate.protocol === "https:" &&
            candidate.hostname.endsWith(".googleusercontent.com")
        ) {
            pictureUrl = candidate.href;
        }
    } catch {
        pictureUrl = null;
    }

    if (pictureUrl) {
        elements.profilePicture.src = pictureUrl;
        elements.profilePicture.hidden = false;
        elements.profileInitial.hidden = true;
        elements.profilePicture.onerror = () => {
            elements.profilePicture.hidden = true;
            elements.profileInitial.hidden = false;
        };
    } else {
        elements.profilePicture.hidden = true;
        elements.profileInitial.hidden = false;
    }

    elements.loginView.hidden = true;
    elements.accountView.hidden = false;
}

function displayConfigurationHelp(message) {
    elements.buttonHost.replaceChildren();
    const loading = document.createElement("span");
    loading.className = "loading-copy";
    loading.textContent = "Login indisponível até configurar o Client ID.";
    elements.buttonHost.append(loading);
    setNotice(message, "error");
}

async function renderGoogleButton() {
    try {
        const { nonce } = await apiRequest("/api/auth/nonce");
        await loadGoogleIdentityServices();
        elements.buttonHost.replaceChildren();

        window.google.accounts.id.initialize({
            client_id: googleClientId,
            nonce,
            auto_select: false,
            cancel_on_tap_outside: true,
            callback: handleGoogleCredential,
        });
        window.google.accounts.id.renderButton(elements.buttonHost, {
            type: "icon",
            theme: "outline",
            size: "signin",
            text: "continue_with",
            shape: "circle",
            width: 200,
            locale: "pt-BR",
        });
        clearNotice();
    } catch (error) {
        elements.buttonHost.replaceChildren();
        const loading = document.createElement("span");
        loading.className = "loading-copy";
        loading.textContent = "Não foi possível carregar o botão de login.";
        elements.buttonHost.append(loading);
        setNotice(error.message, "error");
    }
}

async function handleGoogleCredential(response) {
    if (!response?.credential || loginInProgress) {
        if (!loginInProgress)
            setNotice(
                "O Google não retornou uma credencial. Tente novamente.",
                "error",
            );
        return;
    }

    loginInProgress = true;
    setNotice("Validando sua credencial no servidor…");
    try {
        const result = await apiRequest("/api/auth/google", {
            method: "POST",
            body: JSON.stringify({ id_token: response.credential }),
        });
        if (!result.authenticated || !result.csrfToken) {
            throw new Error(
                "O servidor não criou uma sessão. Tente novamente.",
            );
        }
        showLoggedIn(result.user, result.csrfToken);
    } catch (error) {
        setNotice(error.message, "error");
        await renderGoogleButton();
        setNotice(error.message, "error");
    } finally {
        loginInProgress = false;
    }
}

async function initialize() {
    elements.logoutButton.addEventListener("click", logout);

    let config;
    try {
        config = await apiRequest("/api/config");
    } catch (error) {
        displayConfigurationHelp(error.message);
        return;
    }

    if (!config.configured || !config.clientId) {
        displayConfigurationHelp(
            "Este exemplo ainda não tem Client ID. Consulte as instruções de configuração para ativar o login.",
        );
        return;
    }
    googleClientId = config.clientId;

    try {
        const session = await apiRequest("/api/session");
        if (session.authenticated) {
            showLoggedIn(session.user, session.csrfToken);
            loadGoogleIdentityServices().catch(() => {});
            return;
        }
        showLoggedOut();
        await renderGoogleButton();
    } catch (error) {
        showLoggedOut();
        displayConfigurationHelp(error.message);
    }
}

async function logout() {
    elements.logoutButton.disabled = true;
    setNotice("Encerrando sua sessão…");
    try {
        await apiRequest("/api/logout", {
            method: "POST",
            headers: { "X-CSRF-Token": csrfToken || "" },
            body: JSON.stringify({}),
        });
        if (window.google?.accounts?.id) {
            window.google.accounts.id.disableAutoSelect();
        }
        showLoggedOut();
        setNotice(
            "Você saiu desta aplicação. Sua conta Google continua conectada no navegador.",
            "success",
        );
        await renderGoogleButton();
    } catch (error) {
        setNotice(error.message, "error");
    } finally {
        elements.logoutButton.disabled = false;
    }
}

initialize();
