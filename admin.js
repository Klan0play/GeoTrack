
class AdminPanel {
    constructor() {
        this.init();
    }

    init() {

        this.initCharts();
        

        this.loadDashboardData();
        

        this.initEvents();
        

        this.setActivePage(window.location.hash.substring(1) || 'dashboard');
    }

    initEvents(){
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.getAttribute('href').substring(1);
                this.setActivePage(page);
                window.history.pushState(null, null, `#${page}`);
            });
        })}};
