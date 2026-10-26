export const SIDEBAR_WIDTH_KEY = "sidebar-width";
export const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";
export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 420;

/** Runs before first paint so the saved sidebar width/collapse state doesn't flash. */
export const SIDEBAR_SCRIPT = `try{var d=document.documentElement,w=+localStorage.getItem("${SIDEBAR_WIDTH_KEY}");if(w>=${SIDEBAR_MIN}&&w<=${SIDEBAR_MAX})d.style.setProperty("--sidebar-w",w+"px");if(localStorage.getItem("${SIDEBAR_COLLAPSED_KEY}")==="1")d.classList.add("sidebar-collapsed")}catch(e){}`;
