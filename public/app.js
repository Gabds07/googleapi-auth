const elements = {
    loginView: document.querySelector("#login-view"),
    gameView: document.querySelector("#game-view"),
    buttonHost: document.querySelector("#google-button"),
    notice: document.querySelector("#notice"),
    noticeText: document.querySelector("#notice-text"),
    logoutButton: document.querySelector("#logout-button"),
    signoutGame: document.querySelector("#signout-game"),
    profilePicture: document.querySelector("#profile-picture"),
    profileInitial: document.querySelector("#profile-initial"),
    profileName: document.querySelector("#profile-name"),
    playerChip: document.querySelector("#player-chip"),
    canvas: document.querySelector("#game-canvas"),
    intro: document.querySelector("#intro-screen"),
    pause: document.querySelector("#pause-screen"),
    end: document.querySelector("#end-screen"),
    start: document.querySelector("#start-game"),
    resume: document.querySelector("#resume-game"),
    replay: document.querySelector("#replay-game"),
    pauseButton: document.querySelector("#pause-button"),
    score: document.querySelector("#score-value"),
    aliens: document.querySelector("#alien-count"),
    timer: document.querySelector("#timer-value"),
    timerCaption: document.querySelector("#timer-caption"),
    phaseNumber: document.querySelector("#phase-number"),
    phaseName: document.querySelector("#phase-name"),
    phaseProgress: document.querySelector("#phase-progress"),
    lives: document.querySelector("#lives-display"),
    gameState: document.querySelector("#game-state-label"),
    defcon: document.querySelector("#defcon"),
};
let googleClientId = null,
    csrfToken = null,
    gisScriptPromise = null,
    loginInProgress = false;
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
    if (options.body && !headers.has("Content-Type"))
        headers.set("Content-Type", "application/json");
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
        script.onload = () =>
            window.google?.accounts?.id
                ? resolve()
                : reject(
                      new Error(
                          "O serviço de login do Google não ficou disponível.",
                      ),
                  );
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
    elements.loginView.hidden = false;
    elements.gameView.hidden = true;
    elements.playerChip.hidden = true;
    elements.profilePicture.hidden = true;
    elements.profilePicture.removeAttribute("src");
    elements.profileInitial.hidden = false;
}
function showLoggedIn(user, token) {
    csrfToken = token;
    elements.profileName.textContent = user.name || "Conta Google";
    const initial =
        (user.name || user.email || "P")
            .trim()
            .charAt(0)
            .toLocaleUpperCase("pt-BR") || "P";
    elements.profileInitial.textContent = initial;
    let pictureUrl = null;
    try {
        const candidate = new URL(user.picture);
        if (
            candidate.protocol === "https:" &&
            candidate.hostname.endsWith(".googleusercontent.com")
        )
            pictureUrl = candidate.href;
    } catch {
        pictureUrl = null;
    }
    if (pictureUrl) {
        elements.profilePicture.src = pictureUrl;
        elements.profilePicture.hidden = false;
        elements.profilePicture.onerror = () => {
            elements.profilePicture.hidden = true;
            elements.profileInitial.hidden = false;
        };
    } else {
        elements.profilePicture.hidden = true;
        elements.profileInitial.hidden = false;
    }
    elements.loginView.hidden = true;
    elements.gameView.hidden = false;
    elements.playerChip.hidden = false;
    document.querySelector("#welcome-name").textContent = (
        user.name || "piloto"
    ).split(/\s+/)[0];
    game.prepare();
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
            type: "standard",
            logo_alignment: "center",
            theme: "filled_black",
            size: "large",
            text: "continue_with",
            shape: "rectangular",
            width: 300,
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
        if (!result.authenticated || !result.csrfToken)
            throw new Error(
                "O servidor não criou uma sessão. Tente novamente.",
            );
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
    elements.signoutGame.addEventListener("click", logout);
    let config;
    try {
        config = await apiRequest("/api/config");
    } catch (error) {
        displayConfigurationHelp(error.message);
        return;
    }
    if (!config.configured || !config.clientId) {
        displayConfigurationHelp(
            "Este exemplo ainda não tem Client ID. Configure GOOGLE_CLIENT_ID no servidor para ativar o login.",
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
        if (window.google?.accounts?.id)
            window.google.accounts.id.disableAutoSelect();
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

const canvas = elements.canvas,
    ctx = canvas.getContext("2d", { alpha: false }),
    W = canvas.width,
    H = canvas.height;
const phaseNames = [
    "PRIMEIRO CONTATO",
    "FROTA HOSTIL",
    "CAMPO DE ASTEROIDES",
    "ZONA DE PERIGO",
    "O GUARDIÃO",
];
const shipSprite = [
    "....W....",
    "...WWW...",
    "..WWRWW..",
    ".WWWRWWW.",
    "WWWRRRWWW",
    "...RRR...",
    "..R...R..",
];
const alienSprite = [
    "..GG..GG..",
    ".GGGGGGGG.",
    "GG.GGGG.GG",
    "GGGGGGGGGG",
    "..G.GG.G..",
    ".G......G.",
];
const enemySprite = [
    "...VVV...",
    "..VVVVV..",
    ".VVVVVVV.",
    "VV.VVV.VV",
    "..V...V..",
];
const bigSprite = [
    "..BBBBBB..",
    ".BBBBBBBB.",
    "BBBBBBBBBB",
    "BB.BBBB.BB",
    ".BB....BB.",
];
const patterns = {
    W: "#f4f4ff",
    R: "#ff526e",
    G: "#5af0a0",
    V: "#ff718f",
    B: "#a47bff",
    C: "#58f5eb",
    Y: "#ffd56d",
    O: "#ff9c59",
};
const game = {
    running: false,
    paused: false,
    raf: 0,
    last: 0,
    elapsed: 0,
    score: 0,
    alienKills: 0,
    lives: 3,
    phase: 0,
    phaseTime: 0,
    spawnTimer: 0,
    enemyFireTimer: 0,
    playerFireTimer: 0,
    bossFireTimer: 0,
    upgrade: false,
    upgradeReady: false,
    bossHp: 0,
    bossMax: 0,
    bossX: 480,
    bossDir: 1,
    hitTimer: 0,
    player: { x: 480, y: 520, w: 34, h: 35 },
    shots: [],
    foeShots: [],
    enemies: [],
    particles: [],
    items: [],
    stars: [],
    keys: new Set(),
    touch: new Set(),
    toast: "",
    toastTimer: 0,
    startedAt: 0,
    ended: false,
};
function pixelSprite(sprite, x, y, scale, palette) {
    sprite.forEach((row, ry) =>
        [...row].forEach((ch, rx) => {
            if (ch === ".") return;
            ctx.fillStyle = palette[ch] || "#fff";
            ctx.fillRect(
                Math.round(x + rx * scale),
                Math.round(y + ry * scale),
                scale,
                scale,
            );
        }),
    );
}
function rand(min, max) {
    return Math.random() * (max - min) + min;
}
function formatTime(seconds) {
    const total = Math.floor(seconds);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function hud() {
    elements.score.textContent = String(game.score).padStart(6, "0");
    elements.aliens.textContent = String(game.alienKills).padStart(2, "0");
    elements.timer.textContent = formatTime(game.elapsed);
    elements.phaseNumber.textContent = String(game.phase + 1).padStart(2, "0");
    elements.phaseName.textContent = phaseNames[game.phase] || phaseNames[0];
    elements.defcon.textContent = String(Math.max(1, 5 - game.phase)).padStart(
        2,
        "0",
    );
    elements.phaseProgress.style.width =
        game.phase === 4
            ? `${Math.max(0, 100 * (1 - game.bossHp / game.bossMax))}%`
            : `${Math.min(100, (game.phaseTime / [16, 21, 23, 25][game.phase]) * 100)}%`;
    document.querySelectorAll(".phase-dot").forEach((dot, index) => {
        dot.classList.toggle("current", index === game.phase);
        dot.classList.toggle("done", index < game.phase);
    });
    [...elements.lives.children].forEach((heart, index) =>
        heart.classList.toggle("lost", index >= game.lives),
    );
    elements.timerCaption.textContent = game.running
        ? "TEMPO DECORRIDO"
        : "CRONÔMETRO EM ESPERA";
}
function seedStars() {
    game.stars = Array.from({ length: 92 }, () => ({
        x: rand(0, W),
        y: rand(0, H),
        size: Math.random() > 0.82 ? 2 : 1,
        speed: rand(15, 60),
        color: Math.random() > 0.86 ? "#60e9e6" : "#7b8bab",
    }));
}
function drawBackground(dt = 0) {
    ctx.fillStyle = "#050914";
    ctx.fillRect(0, 0, W, H);
    for (const s of game.stars) {
        if (dt && game.running && !game.paused) s.y = (s.y + s.speed * dt) % H;
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
    }
    ctx.fillStyle = "#17203a";
    for (let y = 65; y < H; y += 90) ctx.fillRect(30, y, W - 60, 1);
    ctx.fillStyle = "#f36d9644";
    ctx.fillRect(40, 55, 2, 2);
    ctx.fillRect(W - 72, 120, 2, 2);
}
function drawShip() {
    const p = game.player;
    if (game.hitTimer > 0 && Math.floor(game.hitTimer * 14) % 2 === 0) return;
    pixelSprite(shipSprite, p.x - 22, p.y - 24, 5, patterns);
    if (game.upgrade) {
        ctx.fillStyle = "#ffd56d";
        ctx.fillRect(p.x - 25, p.y - 11, 4, 13);
        ctx.fillRect(p.x + 21, p.y - 11, 4, 13);
    }
}
function rectHit(a, b) {
    return (
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    );
}
function spawnEnemy() {
    const x = rand(58, W - 58);
    if (game.phase === 0) {
        game.enemies.push({
            type: "alien",
            x,
            y: -32,
            v: rand(38, 70),
            w: 45,
            h: 30,
            phase: rand(0, 8),
            hp: 1,
        });
    } else if (game.phase === 1) {
        const type = Math.random() < 0.52 ? "alien" : "ship";
        game.enemies.push({
            type,
            x,
            y: -35,
            v: rand(38, 65),
            w: 42,
            h: 30,
            phase: rand(0, 8),
            hp: type === "alien" ? 1 : 2,
            fire: 1.5,
        });
    } else if (game.phase === 2) {
        const r = Math.random();
        const type = r < 0.42 ? "alien" : r < 0.7 ? "ship" : "meteor";
        game.enemies.push({
            type,
            x,
            y: -40,
            v: type === "meteor" ? rand(100, 175) : rand(40, 70),
            w: type === "meteor" ? 34 : 42,
            h: type === "meteor" ? 34 : 30,
            phase: rand(0, 8),
            hp: type === "alien" ? 1 : type === "ship" ? 2 : 3,
            rot: rand(-1, 1),
        });
    } else if (game.phase === 3) {
        const r = Math.random();
        const type =
            r < 0.34
                ? "alien"
                : r < 0.54
                  ? "ship"
                  : r < 0.72
                    ? "meteor"
                    : r < 0.85
                      ? "comet"
                      : "big";
        game.enemies.push({
            type,
            x,
            y: -45,
            v:
                type === "comet"
                    ? rand(160, 240)
                    : type === "meteor"
                      ? rand(105, 165)
                      : rand(38, 65),
            w: type === "big" ? 54 : type === "meteor" ? 36 : 44,
            h: type === "big" ? 39 : type === "meteor" ? 34 : 31,
            phase: rand(0, 8),
            hp:
                type === "alien"
                    ? 1
                    : type === "meteor"
                      ? 3
                      : type === "big"
                        ? 6
                        : 2,
            fire: rand(0.2, 1.3),
            rot: rand(-1, 1),
        });
    }
}
function firePlayer() {
    if (!game.running || game.paused || game.ended) return;
    const p = game.player;
    if (game.upgrade) {
        game.shots.push({ x: p.x - 13, y: p.y - 22, w: 5, h: 17, v: 500 });
        game.shots.push({ x: p.x + 8, y: p.y - 22, w: 5, h: 17, v: 500 });
    } else game.shots.push({ x: p.x - 2, y: p.y - 25, w: 5, h: 18, v: 520 });
    game.playerFireTimer = game.upgrade ? 0.7 : 0.35;
}
function fireEnemy(enemy, count = 1) {
    if (count === 1) {
        game.foeShots.push({
            x: enemy.x - 3,
            y: enemy.y + 12,
            w: 6,
            h: 13,
            v: 190,
            type: "bolt",
        });
    } else {
        for (const dx of [-14, 14])
            game.foeShots.push({
                x: enemy.x + dx - 3,
                y: enemy.y + 12,
                w: 6,
                h: 13,
                v: 210,
                type: "bolt",
            });
    }
}
function burst(x, y, color = "var(--cyan)", amount = 9) {
    const col = color === "var(--cyan)" ? "#58f5eb" : color;
    for (let i = 0; i < amount; i++)
        game.particles.push({
            x,
            y,
            vx: rand(-100, 100),
            vy: rand(-110, 90),
            life: rand(0.22, 0.65),
            max: 0.65,
            color: col,
            size: Math.random() > 0.5 ? 3 : 2,
        });
}
function damagePlayer() {
    if (game.hitTimer > 0 || !game.running) return;
    game.lives--;
    game.hitTimer = 1.35;
    burst(game.player.x, game.player.y, "#ff607e", 15);
    if (game.lives <= 0) finish(false);
    hud();
}
function showToast(text) {
    game.toast = text;
    game.toastTimer = 1.8;
}
function spawnUpgrade() {
    game.items.push({
        x: game.player.x,
        y: rand(H * 0.58, H * 0.72),
        type: "upgrade",
        w: 24,
        h: 24,
        v: 75,
    });
    showToast("REFORÇO DE ARMAS DETECTADO");
}
function enterPhase(index) {
    game.phase = index;
    game.phaseTime = 0;
    game.spawnTimer = 1;
    game.enemyFireTimer = 0;
    game.enemies.length = 0;
    game.foeShots.length = 0;
    if (index === 4) {
        game.bossMax = 110;
        game.bossHp = game.bossMax;
        game.bossX = W / 2;
        game.bossDir = 1;
        game.bossFireTimer = 0.75;
        showToast("CHEFE FINAL DETECTADO");
    } else if (index === 0) showToast("SINAL DESCONHECIDO — SETOR 01");
    else
        showToast(
            `FASE ${String(index + 1).padStart(2, "0")} — ${phaseNames[index]}`,
        );
    hud();
}
function start() {
    game.score = 0;
    game.alienKills = 0;
    game.lives = 3;
    game.elapsed = 0;
    game.phase = 0;
    game.phaseTime = 0;
    game.player = { x: W / 2, y: H - 80, w: 34, h: 35 };
    game.shots = [];
    game.foeShots = [];
    game.enemies = [];
    game.items = [];
    game.particles = [];
    game.upgrade = false;
    game.upgradeReady = false;
    game.ended = false;
    game.running = true;
    game.paused = false;
    game.last = performance.now();
    game.startedAt = Date.now();
    elements.intro.hidden = true;
    elements.pause.hidden = true;
    elements.end.hidden = true;
    elements.pauseButton.disabled = false;
    elements.gameState.textContent = "MISSÃO EM ANDAMENTO";
    elements.pauseButton.innerHTML = "Ⅱ <span>PAUSAR MISSÃO</span><kbd>P</kbd>";
    enterPhase(0);
    hud();
    cancelAnimationFrame(game.raf);
    game.raf = requestAnimationFrame(loop);
}
function stop() {
    game.running = false;
    game.paused = false;
    game.ended = true;
    cancelAnimationFrame(game.raf);
    elements.pauseButton.disabled = true;
}
function prepare() {
    stop();
    game.score = 0;
    game.alienKills = 0;
    game.elapsed = 0;
    game.phase = 0;
    game.lives = 3;
    game.upgrade = false;
    elements.intro.hidden = false;
    elements.pause.hidden = true;
    elements.end.hidden = true;
    elements.gameState.textContent = "AGUARDANDO PILOTO";
    elements.pauseButton.disabled = true;
    game.player = { x: W / 2, y: H - 80, w: 34, h: 35 };
    seedStars();
    hud();
    drawBackground();
}
function pause() {
    if (!game.running) return;
    game.paused = !game.paused;
    elements.pause.hidden = !game.paused;
    elements.pauseButton.innerHTML = game.paused
        ? "▶ <span>RETOMAR MISSÃO</span><kbd>P</kbd>"
        : "Ⅱ <span>PAUSAR MISSÃO</span><kbd>P</kbd>";
    if (game.paused) {
        elements.gameState.textContent = "JOGO PAUSADO";
    } else {
        elements.gameState.textContent = "MISSÃO EM ANDAMENTO";
        game.last = performance.now();
        game.raf = requestAnimationFrame(loop);
    }
}
function finish(won) {
    stop();
    elements.pause.hidden = true;
    elements.end.hidden = false;
    elements.gameState.textContent = won ? "MISSÃO CONCLUÍDA" : "NAVE PERDIDA";
    document.querySelector("#end-eyebrow").textContent = won
        ? "FRONTEIRA PROTEGIDA"
        : "SINAL DE SOCORRO";
    document.querySelector("#end-title").innerHTML = won
        ? "Missão <em>concluída.</em>"
        : "Missão <em>encerrada.</em>";
    document.querySelector("#end-copy").textContent = won
        ? "O Guardião caiu. A fronteira está segura, piloto."
        : "A nave ficou sem escudos. Reagrupe e tente novamente.";
    document.querySelector("#final-score").textContent = String(
        game.score,
    ).padStart(6, "0");
    document.querySelector("#final-time").textContent = formatTime(
        game.elapsed,
    );
    elements.timerCaption.textContent = "TEMPO FINAL";
    hud();
}
function drawEnemy(e) {
    if (e.type === "alien")
        pixelSprite(alienSprite, e.x - 25, e.y - 15, 5, patterns);
    else if (e.type === "big")
        pixelSprite(bigSprite, e.x - 30, e.y - 18, 6, patterns);
    else if (e.type === "ship")
        pixelSprite(enemySprite, e.x - 20, e.y - 15, 5, patterns);
    else if (e.type === "meteor") {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot * (game.elapsed % 4));
        ctx.fillStyle = "#9a7063";
        ctx.fillRect(-14, -13, 23, 23);
        ctx.fillStyle = "#c28d74";
        ctx.fillRect(-7, -17, 17, 8);
        ctx.fillRect(4, 0, 12, 12);
        ctx.fillStyle = "#6f514c";
        ctx.fillRect(-8, -7, 6, 6);
        ctx.fillRect(5, 5, 5, 4);
        ctx.restore();
    } else if (e.type === "comet") {
        ctx.fillStyle = "#c0f9ff";
        ctx.fillRect(e.x - 4, e.y - 15, 8, 25);
        ctx.fillStyle = "#f7ffff";
        ctx.fillRect(e.x - 2, e.y - 9, 4, 15);
        ctx.fillStyle = "#57e9ff55";
        ctx.fillRect(e.x - 3, e.y - 60, 6, 46);
        ctx.fillStyle = "#ff87a4";
        ctx.fillRect(e.x - 1, e.y - 20, 2, 5);
    }
}
function drawBoss() {
    const x = game.bossX,
        y = 83;
    pixelSprite(
        [
            "....RRRRRR....",
            "..RRRRRRRRRR..",
            ".RRRBBBBBBBBRRR",
            "RRBBBBBBBBBBBBRR",
            "RRBB..BBBB..BBRR",
            "..B....BB....B..",
        ],
        x - 63,
        y - 24,
        9,
        patterns,
    );
    ctx.fillStyle = "#292039";
    ctx.fillRect(x - 27, y - 2, 54, 11);
    ctx.fillStyle = "#ff647f";
    ctx.fillRect(x - 25, y, 50, 7);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - 18, y + 1, 8, 4);
    ctx.fillRect(x + 10, y + 1, 8, 4);
    ctx.fillStyle = "#56254b";
    ctx.fillRect(x - 91, y + 40, 182, 8);
    ctx.fillStyle = "#ff5d82";
    ctx.fillRect(
        x - 89,
        y + 42,
        178 * Math.max(0, game.bossHp / game.bossMax),
        4,
    );
    ctx.fillStyle = "#ffadc0";
    ctx.font = "bold 11px Courier New";
    ctx.fillText(
        "GUARDIÃO // " + Math.ceil((100 * game.bossHp) / game.bossMax) + "%",
        x - 65,
        y + 67,
    );
}
function loop(now) {
    if (!game.running || game.paused) return;
    const dt = Math.min((now - game.last) / 1000, 0.04);
    game.last = now;
    update(dt);
    draw(dt);
    game.raf = requestAnimationFrame(loop);
}
function update(dt) {
    game.elapsed += dt;
    game.phaseTime += dt;
    game.spawnTimer -= dt;
    game.enemyFireTimer -= dt;
    game.playerFireTimer -= dt;
    game.hitTimer = Math.max(0, game.hitTimer - dt);
    game.toastTimer = Math.max(0, game.toastTimer - dt);
    if (game.keys.has("j") && game.playerFireTimer <= 0) firePlayer();
    let dx = 0,
        dy = 0;
    if (game.keys.has("w") || game.touch.has("up")) dy--;
    if (game.keys.has("s") || game.touch.has("down")) dy++;
    if (game.keys.has("a") || game.touch.has("left")) dx--;
    if (game.keys.has("d") || game.touch.has("right")) dx++;
    const length = Math.hypot(dx, dy) || 1;
    game.player.x = Math.max(
        28,
        Math.min(W - 28, game.player.x + (dx / length) * 230 * dt),
    );
    game.player.y = Math.max(
        H * 0.55,
        Math.min(H - 38, game.player.y + (dy / length) * 230 * dt),
    );
    if (game.touch.has("fire") && game.playerFireTimer <= 0) firePlayer();
    if (game.phase < 4) {
        const duration = [16, 21, 23, 25][game.phase];
        if (
            game.phase === 3 &&
            game.phaseTime > duration - 2 &&
            !game.upgradeReady
        ) {
            game.upgradeReady = true;
            spawnUpgrade();
        }
        if (game.spawnTimer <= 0) {
            spawnEnemy();
            game.spawnTimer =
                game.phase === 0
                    ? 1.05
                    : game.phase === 1
                      ? 0.9
                      : game.phase === 2
                        ? 0.84
                        : 0.73;
        }
        if (game.enemyFireTimer <= 0 && game.phase > 0) {
            const shooters = game.enemies.filter((e) =>
                ["ship", "big"].includes(e.type),
            );
            for (const e of shooters) {
                e.fire -= dt;
                if (e.fire <= 0) {
                    fireEnemy(e, e.type === "big" ? 2 : 1);
                    e.fire = e.type === "big" ? 1.5 : 2.5;
                }
            }
            game.enemyFireTimer = 0.15;
        }
        if (game.phaseTime >= duration) {
            if (game.phase === 3 && !game.upgrade) {
                game.upgrade = true;
                showToast("CANHÃO DUPLO ATIVADO");
            }
            enterPhase(game.phase + 1);
        }
    } else {
        game.bossX += game.bossDir * 75 * dt;
        if (game.bossX > W - 115 || game.bossX < 115) game.bossDir *= -1;
        game.bossFireTimer -= dt;
        if (game.bossFireTimer <= 0) {
            for (const offset of [-45, 0, 45])
                game.foeShots.push({
                    x: game.bossX + offset,
                    y: 127,
                    w: 8,
                    h: 17,
                    v: 205,
                    type: "boss",
                });
            game.bossFireTimer = 0.92;
        }
    }
    for (let i = game.enemies.length - 1; i >= 0; i--) {
        const e = game.enemies[i];
        e.y += e.v * dt;
        if (e.type === "alien")
            e.x += Math.sin(game.elapsed * 2 + e.phase) * 45 * dt;
        else if (e.type === "ship" || e.type === "big")
            e.x += Math.sin(game.elapsed * 1.4 + e.phase) * 25 * dt;
        else if (e.type === "comet")
            e.x += Math.sin(game.elapsed * 4 + e.phase) * 8 * dt;
        let removed = false;
        for (let j = game.shots.length - 1; j >= 0; j--) {
            const s = game.shots[j];
            if (
                rectHit(
                    { x: s.x - 2, y: s.y, w: s.w, h: s.h },
                    { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h },
                )
            ) {
                game.shots.splice(j, 1);
                e.hp--;
                burst(e.x, e.y, e.type === "alien" ? "#5af0a0" : "#ffd56d", 4);
                if (e.hp <= 0) {
                    if (e.type === "alien") {
                        game.score += 100;
                        game.alienKills++;
                        hud();
                    }
                    burst(
                        e.x,
                        e.y,
                        e.type === "alien" ? "#5af0a0" : "#ff718f",
                        10,
                    );
                    game.enemies.splice(i, 1);
                    removed = true;
                    break;
                }
            }
        }
        if (removed) continue;
        if (
            rectHit(
                { x: game.player.x - 13, y: game.player.y - 14, w: 26, h: 25 },
                { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h },
            )
        ) {
            game.enemies.splice(i, 1);
            damagePlayer();
            continue;
        }
        if (e.y > H + 45) game.enemies.splice(i, 1);
    }
    for (let i = game.shots.length - 1; i >= 0; i--) {
        const s = game.shots[i];
        s.y -= s.v * dt;
        if (s.y < -25) {
            game.shots.splice(i, 1);
            continue;
        }
        if (
            game.phase === 4 &&
            Math.abs(s.x - game.bossX) < 75 &&
            s.y < 155 &&
            s.y > 52
        ) {
            game.shots.splice(i, 1);
            game.bossHp = Math.max(0, game.bossHp - (game.upgrade ? 2 : 1));
            if (game.bossHp === 0) {
                burst(game.bossX, 95, "#ff718f", 45);
                finish(true);
            }
            hud();
        }
    }
    for (let i = game.foeShots.length - 1; i >= 0; i--) {
        const b = game.foeShots[i];
        b.y += b.v * dt;
        if (b.y > H + 25) {
            game.foeShots.splice(i, 1);
            continue;
        }
        if (
            rectHit(
                { x: game.player.x - 12, y: game.player.y - 12, w: 24, h: 24 },
                { x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h },
            )
        ) {
            game.foeShots.splice(i, 1);
            damagePlayer();
        }
    }
    for (let i = game.items.length - 1; i >= 0; i--) {
        const item = game.items[i];
        item.y += item.v * dt;
        if (
            rectHit(
                { x: game.player.x - 16, y: game.player.y - 16, w: 32, h: 32 },
                { x: item.x - 12, y: item.y - 12, w: 24, h: 24 },
            )
        ) {
            game.upgrade = true;
            game.items.splice(i, 1);
            showToast("CANHÃO DUPLO ATIVADO");
        } else if (item.y > H + 30) game.items.splice(i, 1);
    }
    for (let i = game.particles.length - 1; i >= 0; i--) {
        const p = game.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) game.particles.splice(i, 1);
    }
    if (game.toastTimer <= 0) game.toast = "";
    hud();
}
function draw(dt) {
    drawBackground(dt);
    for (const item of game.items) {
        ctx.fillStyle = "#ffd56d";
        ctx.fillRect(item.x - 9, item.y - 9, 18, 18);
        ctx.fillStyle = "#12202a";
        ctx.font = "bold 16px Courier New";
        ctx.fillText("✦", item.x - 7, item.y + 6);
        ctx.strokeStyle = "#fff0ad";
        ctx.strokeRect(item.x - 12, item.y - 12, 24, 24);
    }
    for (const e of game.enemies) drawEnemy(e);
    if (game.phase === 4 && game.running) drawBoss();
    for (const s of game.shots) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = "#ff6384";
        ctx.fillRect(s.x, s.y + 4, s.w, 4);
        ctx.fillStyle = "#62f4ed";
        ctx.fillRect(s.x + 1, s.y + s.h - 2, s.w - 2, 2);
    }
    for (const b of game.foeShots) {
        ctx.fillStyle = b.type === "boss" ? "#ff6c8a" : "#fa7e73";
        ctx.fillRect(b.x - 3, b.y - 7, 6, 14);
        ctx.fillStyle = "#ffd5a1";
        ctx.fillRect(b.x - 1, b.y - 5, 2, 8);
    }
    for (const p of game.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    drawShip();
    if (game.toastTimer > 0 && game.toast) {
        ctx.fillStyle = "#0b1120dd";
        ctx.fillRect(W / 2 - 160, 22, 320, 28);
        ctx.strokeStyle = "#455477";
        ctx.strokeRect(W / 2 - 160, 22, 320, 28);
        ctx.fillStyle = game.toast.includes("DUPLO") ? "#ffd56d" : "#d8e4ff";
        ctx.font = "bold 10px Courier New";
        ctx.textAlign = "center";
        ctx.fillText(game.toast, W / 2, 40);
        ctx.textAlign = "left";
    }
}

function bindGameControls() {
    elements.start.addEventListener("click", start);
    elements.resume.addEventListener("click", pause);
    elements.replay.addEventListener("click", start);
    elements.pauseButton.addEventListener("click", pause);
    window.addEventListener("keydown", (event) => {
        const key = event.key.toLowerCase();
        if (["w", "a", "s", "d", "j", "p"].includes(key)) {
            event.preventDefault();
            game.keys.add(key);
            if (key === "p" && !event.repeat) pause();
        }
    });
    window.addEventListener("keyup", (event) =>
        game.keys.delete(event.key.toLowerCase()),
    );
    window.addEventListener("blur", () => {
        game.keys.clear();
        game.touch.clear();
    });
    document.querySelectorAll("[data-move]").forEach((button) => {
        const direction = button.dataset.move;
        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            button.setPointerCapture(event.pointerId);
            game.touch.add(direction);
        });
        for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
            button.addEventListener(type, () => game.touch.delete(direction));
    });
    const fire = document.querySelector("#touch-fire");
    fire.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        fire.setPointerCapture(event.pointerId);
        game.touch.add("fire");
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
        fire.addEventListener(type, () => game.touch.delete("fire"));
}
bindGameControls();
initialize();
