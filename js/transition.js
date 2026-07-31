"use strict";

const TRANSITION_KEY = "collabora8:pixel-transition";
const ARRIVAL_WINDOW = 10000;

let transitionInProgress = false;
let activeOverlay = null;

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

initializePage();

function initializePage() {
    const pendingTransition = takePendingTransition();

    if (pendingTransition) {
        revealPage(pendingTransition.direction);
    } else {
        document.documentElement.classList.remove("is-transition-arrival");
        prepareAvatarInterface();
    }

    document.querySelectorAll(".page-transition").forEach((link) => {
        link.addEventListener("click", handleTransitionClick);
    });

    window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
            resetTransitionState();
            prepareAvatarInterface();
        }
    });
}

function handleTransitionClick(event) {
    if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
    ) {
        return;
    }

    const link = event.currentTarget;
    const destination = link.getAttribute("href");

    if (!destination || transitionInProgress) {
        return;
    }

    event.preventDefault();

    const direction = document.body.classList.contains("avatar-page")
        ? "reverse"
        : "forward";

    coverPage(destination, direction);
}

function coverPage(destination, direction) {
    transitionInProgress = true;

    lockPage();

    activeOverlay = createPixelOverlay(direction, "cover");
    document.body.appendChild(activeOverlay);

    requestAnimationFrame(() => {
        activeOverlay.classList.add("is-active", "is-covering");
    });

    const coverDuration = reducedMotionQuery.matches ? 90 : 575;

    window.setTimeout(() => {
        savePendingTransition(destination, direction);
        window.location.assign(destination);
    }, coverDuration);
}

function revealPage(direction) {
    transitionInProgress = true;

    lockPage();

    activeOverlay = createPixelOverlay(direction, "reveal");
    activeOverlay.classList.add("is-revealing");
    document.body.appendChild(activeOverlay);

    document.documentElement.classList.remove("is-transition-arrival");
    prepareAvatarInterface();

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            activeOverlay.classList.add("is-active");
        });
    });

    const revealDuration = reducedMotionQuery.matches ? 110 : 460;

    window.setTimeout(() => {
        resetTransitionState();
    }, revealDuration);
}

function createPixelOverlay(direction, phase) {
    const overlay = document.createElement("div");
    const grid = calculatePixelGrid();
    const finalDistance = grid.columns + grid.rows - 2;
    const waveDuration = phase === "cover" ? 430 : 300;

    overlay.className = `pixel-transition pixel-transition--${direction}`;
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.setProperty("--pixel-columns", grid.columns);
    overlay.style.setProperty("--pixel-rows", grid.rows);
    overlay.style.setProperty("--pixel-size", `${grid.size}px`);

    for (let row = 0; row < grid.rows; row += 1) {
        for (let column = 0; column < grid.columns; column += 1) {
            const pixel = document.createElement("span");
            const distance = getDirectionalDistance(
                direction,
                row,
                column,
                grid.rows,
                grid.columns
            );
            const delay = reducedMotionQuery.matches
                ? 0
                : Math.round((distance / Math.max(finalDistance, 1)) * waveDuration) +
                    getTimingVariation(row, column);

            pixel.style.setProperty("--pixel-delay", `${delay}ms`);
            pixel.style.setProperty(
                "--pixel-colour",
                getDarkPixelColour(row, column)
            );
            pixel.style.setProperty(
                "--pixel-edge-colour",
                getWaveEdgeColour(row, column, direction)
            );

            overlay.appendChild(pixel);
        }
    }

    return overlay;
}

function calculatePixelGrid() {
    if (reducedMotionQuery.matches) {
        return {
            columns: 1,
            rows: 1,
            size: Math.ceil(Math.max(window.innerWidth, window.innerHeight))
        };
    }

    const isMobile = window.innerWidth <= 700;
    const targetColumns = isMobile ? 7 : 20;
    const targetRows = isMobile ? 12 : 12;
    const size = Math.ceil(
        Math.max(
            window.innerWidth / targetColumns,
            window.innerHeight / targetRows
        )
    );

    return {
        columns: Math.ceil(window.innerWidth / size),
        rows: Math.ceil(window.innerHeight / size),
        size
    };
}

function getDirectionalDistance(direction, row, column, rows, columns) {
    if (direction === "reverse") {
        return row + (columns - 1 - column);
    }

    return rows - 1 - row + column;
}

function getTimingVariation(row, column) {
    return ((row * 3 + column * 5) % 3) * 4;
}

function getDarkPixelColour(row, column) {
    const darkPanels = ["#04060d", "#050813", "#070b17", "#080d1c"];

    return darkPanels[(row + column * 2) % darkPanels.length];
}

function getWaveEdgeColour(row, column, direction) {
    const pattern = (row * 7 + column * 11) % 29;

    if (direction === "reverse") {
        if (pattern === 0 || pattern === 17) {
            return "#1887c7";
        }

        if (pattern === 8) {
            return "#62d9dc";
        }

        if (pattern === 23) {
            return "#3970b8";
        }

        return (row + column) % 2 === 0 ? "#0d1b2e" : "#10233a";
    }

    if (pattern === 0 || pattern === 19) {
        return "#7960d9";
    }

    if (pattern === 8) {
        return "#18a9d1";
    }

    if (pattern === 14) {
        return "#20c7bf";
    }

    return (row + column) % 2 === 0 ? "#101a34" : "#13223e";
}

function savePendingTransition(destination, direction) {
    try {
        const target = new URL(destination, window.location.href).pathname;

        sessionStorage.setItem(
            TRANSITION_KEY,
            JSON.stringify({
                direction,
                target,
                createdAt: Date.now()
            })
        );
    } catch (error) {
        // Navigation still works if storage is unavailable.
    }
}

function takePendingTransition() {
    try {
        const rawTransition = sessionStorage.getItem(TRANSITION_KEY);

        if (!rawTransition) {
            return null;
        }

        sessionStorage.removeItem(TRANSITION_KEY);

        const transition = JSON.parse(rawTransition);
        const isFresh = Date.now() - transition.createdAt < ARRIVAL_WINDOW;
        const targetsCurrentPage = normalisePath(transition.target) ===
            normalisePath(window.location.pathname);
        const hasValidDirection = ["forward", "reverse"].includes(
            transition.direction
        );

        return isFresh && targetsCurrentPage && hasValidDirection
            ? transition
            : null;
    } catch (error) {
        return null;
    }
}

function normalisePath(pathname) {
    const decodedPath = decodeURIComponent(pathname).replace(/\\/g, "/");

    return decodedPath.endsWith("/")
        ? `${decodedPath}index.html`.toLowerCase()
        : decodedPath.toLowerCase();
}

function lockPage() {
    document.documentElement.classList.add("is-transitioning");

    document.querySelectorAll(".page-transition").forEach((link) => {
        link.setAttribute("aria-disabled", "true");
    });
}

function resetTransitionState() {
    document.querySelectorAll(".pixel-transition").forEach((overlay) => {
        overlay.remove();
    });

    document.documentElement.classList.remove(
        "is-transitioning",
        "is-transition-arrival"
    );

    document.querySelectorAll(".page-transition").forEach((link) => {
        link.removeAttribute("aria-disabled");
    });

    activeOverlay = null;
    transitionInProgress = false;
}

function prepareAvatarInterface() {
    if (!document.body.classList.contains("avatar-page")) {
        return;
    }

    requestAnimationFrame(() => {
        document.body.classList.add("avatar-interface-ready");
    });
}
