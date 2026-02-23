// ===== CONFIGURATION =====
const CONFIG = {
    API_URL: 'http://localhost:3000/api',
    MAP_CENTER: [48.0, 68.0],
    MAP_ZOOM: 5,
    DEFAULT_ICON: L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34]
    }),
    CATEGORY_COLORS: {
        nature: '#4CAF50',
        history: '#FF9800',
        culture: '#9C27B0',
        architecture: '#2196F3'
    },
    CATEGORY_ICONS: {
        nature: 'fa-tree',
        history: 'fa-landmark',
        culture: 'fa-theater-masks',
        architecture: 'fa-building'
    }
};

// ===== STATE MANAGEMENT =====
class AppState {
    constructor() {
        this.user = JSON.parse(localStorage.getItem('geotrack_user')) || null;
        this.favorites = JSON.parse(localStorage.getItem('geotrack_favorites')) || [];
        this.visited = JSON.parse(localStorage.getItem('geotrack_visited')) || [];
        this.settings = JSON.parse(localStorage.getItem('geotrack_settings')) || {
            theme: 'light',
            notifications: true,
            autoPlay: true,
            offlineMode: false
        };
        this.currentPage = 'map';
        this.currentPlace = null;
        this.map = null;
        this.markers = L.markerClusterGroup();
        this.places = [];
        this.routes = [];
        this.reviews = [];
        this.audioPlayer = new Audio();
        this.isAudioPlaying = false;
    }

    saveUser(user) {
        this.user = user;
        localStorage.setItem('geotrack_user', JSON.stringify(user));
        this.updateUI();
    }

    logout() {
        this.user = null;
        localStorage.removeItem('geotrack_user');
        this.updateUI();
    }

    toggleFavorite(placeId) {
        const index = this.favorites.indexOf(placeId);
        if (index > -1) {
            this.favorites.splice(index, 1);
        } else {
            this.favorites.push(placeId);
        }
        localStorage.setItem('geotrack_favorites', JSON.stringify(this.favorites));
        return index === -1;
    }

    addVisited(placeId) {
        if (!this.visited.includes(placeId)) {
            this.visited.push(placeId);
            localStorage.setItem('geotrack_visited', JSON.stringify(this.visited));
        }
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        localStorage.setItem('geotrack_settings', JSON.stringify(this.settings));
        this.applySettings();
    }

    applySettings() {
        document.documentElement.setAttribute('data-theme', this.settings.theme);
    }

    updateUI() {
        // Update user display
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');
        const userAvatar = document.getElementById('userAvatar');
        const profileName = document.getElementById('profileName');
        const profileEmail = document.getElementById('profileEmail');
        const profileAvatar = document.getElementById('profileAvatar');

        if (this.user) {
            userName.textContent = this.user.name;
            userEmail.textContent = this.user.email;
            userAvatar.textContent = this.user.name.charAt(0).toUpperCase();
            profileName.textContent = this.user.name;
            profileEmail.textContent = this.user.email;
            profileAvatar.textContent = this.user.name.charAt(0).toUpperCase();
            
            document.getElementById('loginBtn').style.display = 'none';
            document.getElementById('userDropdown').style.display = 'block';
        } else {
            userName.textContent = 'Гость';
            userEmail.textContent = '';
            userAvatar.textContent = 'Г';
            profileName.textContent = 'Гость';
            profileEmail.textContent = 'Войдите для доступа к профилю';
            profileAvatar.textContent = 'Г';
            
            document.getElementById('loginBtn').style.display = 'flex';
            document.getElementById('userDropdown').style.display = 'none';
        }

        // Update counts
        document.getElementById('favoritesCount').textContent = this.favorites.length;
        document.getElementById('visitedCount').textContent = this.visited.length;
        document.getElementById('favoritePlaces').textContent = this.favorites.length;
    }
}

// ===== MAP MANAGER =====
class MapManager {
    constructor() {
        this.map = null;
        this.markers = L.markerClusterGroup();
        this.places = [];
        this.currentLayer = 'standard';
    }

    init() {
        this.map = L.map('map').setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
        
        // Add base layers
        this.layers = {
            standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }),
            satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: '© Esri'
            }),
            terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenTopoMap'
            })
        };

        this.layers.standard.addTo(this.map);
        this.markers.addTo(this.map);

        // Add map controls
        this.addMapControls();
        this.loadPlaces();
    }

    addMapControls() {
        // Zoom controls
        document.getElementById('zoom-in').addEventListener('click', () => {
            this.map.zoomIn();
        });

        document.getElementById('zoom-out').addEventListener('click', () => {
            this.map.zoomOut();
        });

        // Location button
        document.getElementById('myLocationBtn').addEventListener('click', () => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((position) => {
                    const { latitude, longitude } = position.coords;
                    this.map.setView([latitude, longitude], 13);
                    
                    // Add user marker
                    L.marker([latitude, longitude], {
                        icon: L.divIcon({
                            className: 'user-location-marker',
                            html: '<i class="fas fa-location-dot" style="color: #1e88e5; font-size: 24px;"></i>',
                            iconSize: [24, 24]
                        })
                    }).addTo(this.map)
                    .bindPopup('Ваше местоположение')
                    .openPopup();
                });
            }
        });

        // Layer switcher
        document.querySelectorAll('[data-layer]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const layer = e.target.dataset.layer;
                this.switchLayer(layer);
                document.querySelectorAll('[data-layer]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        // Fullscreen
        document.getElementById('fullscreen-btn').addEventListener('click', () => {
            const mapContainer = document.getElementById('map');
            if (!document.fullscreenElement) {
                mapContainer.requestFullscreen().catch(err => {
                    console.log(`Error attempting to enable fullscreen: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        });
    }

    switchLayer(layer) {
        if (this.currentLayer !== layer) {
            this.map.removeLayer(this.layers[this.currentLayer]);
            this.layers[layer].addTo(this.map);
            this.currentLayer = layer;
        }
    }

    async loadPlaces() {
        try {
            // In production, fetch from API
            // const response = await fetch(`${CONFIG.API_URL}/places`);
            // this.places = await response.json();
            
            // Mock data for demo
            this.places = [
                {
                    id: 1,
                    name: 'Бозжыра',
                    region: 'Мангистау',
                    lat: 43.5,
                    lng: 52.0,
                    category: 'nature',
                    rating: 4.8,
                    description: 'Уникальные известняковые каньоны, напоминающие лунный пейзаж.',
                    image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
                    audio: 'audio/bozhjira.mp3'
                },
                {
                    id: 2,
                    name: 'Чарынский каньон',
                    region: 'Алматинская область',
                    lat: 43.5,
                    lng: 79.2,
                    category: 'nature',
                    rating: 4.9,
                    description: 'Величественный каньон на реке Чарын, возраст которого составляет около 12 миллионов лет.',
                    image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
                    audio: 'audio/charyn.mp3'
                },
                {
                    id: 3,
                    name: 'Тамгалы Тас',
                    region: 'Жамбылская область',
                    lat: 43.8,
                    lng: 75.5,
                    category: 'history',
                    rating: 4.7,
                    description: 'Древние петроглифы и буддийские надписи на скалах.',
                    image: 'https://images.unsplash.com/photo-1540206395-68808572332f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
                    audio: 'audio/tamgaly.mp3'
                },
                {
                    id: 4,
                    name: 'Байтерек',
                    region: 'Астана',
                    lat: 51.128,
                    lng: 71.430,
                    category: 'architecture',
                    rating: 4.6,
                    description: 'Монумент и смотровая башня, символ Астаны.',
                    image: 'https://images.unsplash.com/photo-1548013146-72479768bada?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
                    audio: 'audio/bayterek.mp3'
                },
                {
                    id: 5,
                    name: 'Поющий бархан',
                    region: 'Алматинская область',
                    lat: 44.9,
                    lng: 78.2,
                    category: 'nature',
                    rating: 4.5,
                    description: 'Уникальный бархан, издающий звуки при ветре.',
                    image: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
                    audio: 'audio/singing_dune.mp3'
                }
            ];

            this.renderPlaces();
            this.addMarkers();
        } catch (error) {
            console.error('Error loading places:', error);
            this.showNotification('Ошибка загрузки данных', 'error');
        }
    }

    addMarkers() {
        this.markers.clearLayers();
        
        this.places.forEach(place => {
            const icon = L.divIcon({
                className: `map-marker ${place.category}`,
                html: `
                    <div class="marker-icon" style="background: ${CONFIG.CATEGORY_COLORS[place.category] || '#666'}">
                        <i class="fas ${CONFIG.CATEGORY_ICONS[place.category] || 'fa-map-marker'}"></i>
                    </div>
                    <div class="marker-label">${place.name}</div>
                `,
                iconSize: [40, 50],
                iconAnchor: [20, 50]
            });

            const marker = L.marker([place.lat, place.lng], { icon })
                .bindPopup(this.createPopupContent(place))
                .on('click', () => this.onMarkerClick(place));

            this.markers.addLayer(marker);
            place.marker = marker;
        });

        this.updateMapStats();
    }

    createPopupContent(place) {
        return `
            <div class="map-popup">
                <h3>${place.name}</h3>
                <p><i class="fas fa-map-marker-alt"></i> ${place.region}</p>
                <p><i class="fas fa-star"></i> ${place.rating}/5</p>
                <p>${place.description.substring(0, 100)}...</p>
                <div class="popup-actions">
                    <button class="btn btn-sm btn-primary" onclick="app.showPlaceDetails(${place.id})">
                        Подробнее
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="app.playAudio(${place.id})">
                        <i class="fas fa-play"></i> Аудио
                    </button>
                </div>
            </div>
        `;
    }

    onMarkerClick(place) {
        app.state.currentPlace = place;
        app.state.addVisited(place.id);
        app.updateVisitedCount();
    }

    filterMarkers() {
        const categoryFilters = Array.from(document.querySelectorAll('.filter-options input:checked'))
            .map(input => input.value);
        const regionFilter = document.getElementById('regionFilter').value;
        const ratingFilter = parseInt(document.getElementById('ratingFilter').value);

        this.places.forEach(place => {
            const visible = 
                (categoryFilters.length === 0 || categoryFilters.includes(place.category)) &&
                (!regionFilter || place.region === regionFilter) &&
                place.rating >= ratingFilter;

            if (visible) {
                this.markers.addLayer(place.marker);
            } else {
                this.markers.removeLayer(place.marker);
            }
        });

        this.updateMapStats();
    }

    updateMapStats() {
        const visibleCount = this.places.filter(p => 
            this.markers.hasLayer(p.marker)
        ).length;
        
        document.getElementById('visiblePlaces').textContent = visibleCount;
        document.getElementById('totalPlaces').textContent = `${this.places.length}+`;
    }

    renderPlaces() {
        const gridContainer = document.getElementById('placesGrid');
        const listContainer = document.getElementById('placesList');
        
        gridContainer.innerHTML = '';
        listContainer.innerHTML = '';
        
        this.places.forEach(place => {
            const isFavorite = app.state.favorites.includes(place.id);
            const isVisited = app.state.visited.includes(place.id);
            
            const placeCard = this.createPlaceCard(place, isFavorite, isVisited);
            const placeListItem = this.createPlaceListItem(place, isFavorite, isVisited);
            
            gridContainer.appendChild(placeCard);
            listContainer.appendChild(placeListItem);
        });
    }

    createPlaceCard(place, isFavorite, isVisited) {
        const div = document.createElement('div');
        div.className = 'place-card';
        div.innerHTML = `
            <div class="place-img" style="background-image: url('${place.image}')">
                <span class="place-badge">${place.category === 'nature' ? 'Природа' : 
                                           place.category === 'history' ? 'История' :
                                           place.category === 'culture' ? 'Культура' : 'Архитектура'}</span>
                <button class="favorite-btn ${isFavorite ? 'active' : ''}" onclick="app.toggleFavorite(${place.id})">
                    <i class="fas fa-heart"></i>
                </button>
            </div>
            <div class="place-content">
                <div class="place-title">
                    <h4>${place.name}</h4>
                    <div class="place-rating">
                        <i class="fas fa-star"></i>
                        ${place.rating}
                    </div>
                </div>
                <div class="place-meta">
                    <span><i class="fas fa-map-marker-alt"></i> ${place.region}</span>
                    ${isVisited ? '<span class="visited-badge"><i class="fas fa-check-circle"></i> Посещено</span>' : ''}
                </div>
                <p class="place-description">${place.description}</p>
                <div class="place-actions">
                    <button class="btn btn-sm btn-primary" onclick="app.showPlaceDetails(${place.id})">
                        <i class="fas fa-info-circle"></i> Подробнее
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="app.playAudio(${place.id})">
                        <i class="fas fa-play"></i> Аудиогид
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="app.addToRoute(${place.id})">
                        <i class="fas fa-route"></i> В маршрут
                    </button>
                </div>
            </div>
        `;
        return div;
    }

    createPlaceListItem(place, isFavorite, isVisited) {
        const div = document.createElement('div');
        div.className = 'place-list-item';
        div.innerHTML = `
            <div class="list-item-content">
                <div class="list-item-header">
                    <h4>${place.name}</h4>
                    <div class="list-item-meta">
                        <span class="rating"><i class="fas fa-star"></i> ${place.rating}</span>
                        <span class="region"><i class="fas fa-map-marker-alt"></i> ${place.region}</span>
                        ${isVisited ? '<span class="visited"><i class="fas fa-check-circle"></i> Посещено</span>' : ''}
                    </div>
                </div>
                <p class="list-item-description">${place.description}</p>
                <div class="list-item-actions">
                    <button class="btn btn-sm" onclick="app.toggleFavorite(${place.id})">
                        <i class="fas fa-heart ${isFavorite ? 'active' : ''}"></i>
                    </button>
                    <button class="btn btn-sm" onclick="app.showPlaceDetails(${place.id})">
                        <i class="fas fa-info-circle"></i>
                    </button>
                    <button class="btn btn-sm" onclick="app.playAudio(${place.id})">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
        `;
        return div;
    }
}

// ===== AUDIO PLAYER =====
class AudioPlayer {
    constructor() {
        this.audio = new Audio();
        this.currentTrack = null;
        this.isPlaying = false;
        this.volume = 0.8;
        
        this.audio.addEventListener('timeupdate', this.updateProgress.bind(this));
        this.audio.addEventListener('ended', this.onTrackEnd.bind(this));
        
        this.initControls();
    }

    initControls() {
        document.getElementById('playBtn').addEventListener('click', () => this.togglePlay());
        document.getElementById('prevBtn').addEventListener('click', () => this.prevTrack());
        document.getElementById('nextBtn').addEventListener('click', () => this.nextTrack());
        document.getElementById('progressBar').addEventListener('input', (e) => this.seek(e.target.value));
        document.getElementById('volumeBar').addEventListener('input', (e) => this.setVolume(e.target.value));
        document.getElementById('volumeBtn').addEventListener('click', () => this.toggleMute());
        document.getElementById('closePlayerBtn').addEventListener('click', () => this.hide());
    }

    play(place) {
        if (!place.audio) {
            app.showNotification('Аудиогид недоступен для этого места', 'warning');
            return;
        }

        this.currentTrack = place;
        this.audio.src = place.audio;
        this.audio.volume = this.volume;
        
        document.getElementById('trackTitle').textContent = `Аудиогид: ${place.name}`;
        document.getElementById('trackPlace').textContent = place.region;
        
        this.show();
        this.audio.play()
            .then(() => {
                this.isPlaying = true;
                this.updatePlayButton();
            })
            .catch(error => {
                console.error('Error playing audio:', error);
                app.showNotification('Ошибка воспроизведения аудио', 'error');
            });
    }

    togglePlay() {
        if (!this.currentTrack) return;
        
        if (this.isPlaying) {
            this.audio.pause();
        } else {
            this.audio.play();
        }
        this.isPlaying = !this.isPlaying;
        this.updatePlayButton();
    }

    updatePlayButton() {
        const playBtn = document.getElementById('playBtn');
        playBtn.innerHTML = this.isPlaying ? 
            '<i class="fas fa-pause"></i>' : 
            '<i class="fas fa-play"></i>';
    }

    prevTrack() {
        // Implement previous track logic
        app.showNotification('Предыдущий трек', 'info');
    }

    nextTrack() {
        // Implement next track logic
        app.showNotification('Следующий трек', 'info');
    }

    seek(percentage) {
        if (!this.currentTrack) return;
        
        const duration = this.audio.duration;
        if (duration) {
            this.audio.currentTime = (percentage / 100) * duration;
        }
    }

    setVolume(value) {
        this.volume = value / 100;
        this.audio.volume = this.volume;
        
        const volumeBtn = document.getElementById('volumeBtn');
        if (value == 0) {
            volumeBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else if (value < 50) {
            volumeBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
        } else {
            volumeBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
    }

    toggleMute() {
        if (this.audio.volume > 0) {
            this.audio.volume = 0;
            document.getElementById('volumeBar').value = 0;
        } else {
            this.audio.volume = this.volume;
            document.getElementById('volumeBar').value = this.volume * 100;
        }
        this.setVolume(this.audio.volume * 100);
    }

    updateProgress() {
        if (!this.currentTrack) return;
        
        const progressBar = document.getElementById('progressBar');
        const currentTime = document.getElementById('currentTime');
        const duration = document.getElementById('duration');
        
        const percent = (this.audio.currentTime / this.audio.duration) * 100 || 0;
        progressBar.value = percent;
        
        currentTime.textContent = this.formatTime(this.audio.currentTime);
        duration.textContent = this.formatTime(this.audio.duration);
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    onTrackEnd() {
        this.isPlaying = false;
        this.updatePlayButton();
    }

    show() {
        document.querySelector('.audio-player').classList.add('active');
    }

    hide() {
        document.querySelector('.audio-player').classList.remove('active');
        this.audio.pause();
        this.isPlaying = false;
        this.updatePlayButton();
    }
}

// ===== REVIEWS MANAGER =====
class ReviewsManager {
    constructor() {
        this.reviews = [];
        this.chart = null;
    }

    async loadReviews() {
        try {
            // In production, fetch from API
            // const response = await fetch(`${CONFIG.API_URL}/reviews`);
            // this.reviews = await response.json();
            
            // Mock data for demo
            this.reviews = [
                {
                    id: 1,
                    placeId: 1,
                    userId: 1,
                    userName: 'Александр',
                    userAvatar: 'А',
                    rating: 5,
                    comment: 'Невероятное место! Похоже на другую планету. Обязательно к посещению!',
                    date: '2024-03-15',
                    likes: 24
                },
                {
                    id: 2,
                    placeId: 2,
                    userId: 2,
                    userName: 'Мария',
                    userAvatar: 'М',
                    rating: 5,
                    comment: 'Величественная красота природы. Аудиогид очень информативный.',
                    date: '2024-03-10',
                    likes: 18
                },
                {
                    id: 3,
                    placeId: 3,
                    userId: 3,
                    userName: 'Дмитрий',
                    userAvatar: 'Д',
                    rating: 4,
                    comment: 'Интересное историческое место, но дорога требует подготовки.',
                    date: '2024-03-05',
                    likes: 12
                }
            ];

            this.renderReviews();
            this.renderChart();
        } catch (error) {
            console.error('Error loading reviews:', error);
        }
    }

    renderReviews() {
        const container = document.getElementById('reviewsList');
        container.innerHTML = '';
        
        this.reviews.forEach(review => {
            const place = app.mapManager.places.find(p => p.id === review.placeId);
            if (!place) return;
            
            const reviewCard = document.createElement('div');
            reviewCard.className = 'review-card';
            reviewCard.innerHTML = `
                <div class="review-header">
                    <div class="review-author">
                        <div class="review-avatar">${review.userAvatar}</div>
                        <div>
                            <strong>${review.userName}</strong>
                            <div class="review-place">${place.name}</div>
                        </div>
                    </div>
                    <div class="review-rating">
                        ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}
                        <span class="review-date">${review.date}</span>
                    </div>
                </div>
                <div class="review-content">
                    <p>${review.comment}</p>
                </div>
                <div class="review-actions">
                    <button class="btn btn-sm" onclick="app.likeReview(${review.id})">
                        <i class="fas fa-thumbs-up"></i> ${review.likes}
                    </button>
                    <button class="btn btn-sm" onclick="app.replyToReview(${review.id})">
                        <i class="fas fa-reply"></i> Ответить
                    </button>
                </div>
            `;
            container.appendChild(reviewCard);
        });
        
        document.getElementById('totalReviewsCount').textContent = this.reviews.length;
        document.getElementById('avgRating').textContent = 
            (this.reviews.reduce((sum, r) => sum + r.rating, 0) / this.reviews.length).toFixed(1);
    }

    renderChart() {
        const ctx = document.getElementById('reviewsChart').getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }
        
        const ratings = [0, 0, 0, 0, 0];
        this.reviews.forEach(review => {
            ratings[review.rating - 1]++;
        });
        
        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['1★', '2★', '3★', '4★', '5★'],
                datasets: [{
                    label: 'Количество отзывов',
                    data: ratings,
                    backgroundColor: [
                        '#FF5252',
                        '#FF9800',
                        '#FFEB3B',
                        '#4CAF50',
                        '#2196F3'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    async addReview(placeId, rating, comment) {
        if (!app.state.user) {
            app.showNotification('Войдите, чтобы оставить отзыв', 'warning');
            return;
        }
        
        const review = {
            placeId,
            userId: app.state.user.id,
            userName: app.state.user.name,
            userAvatar: app.state.user.name.charAt(0).toUpperCase(),
            rating,
            comment,
            date: new Date().toISOString().split('T')[0],
            likes: 0
        };
        
        try {
            // In production, post to API
            // const response = await fetch(`${CONFIG.API_URL}/reviews`, {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(review)
            // });
            // const newReview = await response.json();
            
            // For demo, add locally
            review.id = this.reviews.length + 1;
            this.reviews.unshift(review);
            
            this.renderReviews();
            this.renderChart();
            
            app.showNotification('Спасибо за ваш отзыв!', 'success');
            app.closeModal();
        } catch (error) {
            console.error('Error adding review:', error);
            app.showNotification('Ошибка при добавлении отзыва', 'error');
        }
    }
}

// ===== MAIN APP =====
class GeoTrackApp {
    constructor() {
        this.state = new AppState();
        this.mapManager = new MapManager();
        this.audioPlayer = new AudioPlayer();
        this.reviewsManager = new ReviewsManager();
        
        this.init();
    }

    init() {
        // Apply saved settings
        this.state.applySettings();
        
        // Initialize components
        this.initUI();
        this.initEvents();
        this.initMap();
        this.loadData();
        
        // Hide loading screen
        setTimeout(() => {
            document.getElementById('loading').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('loading').style.display = 'none';
            }, 500);
        }, 1000);
        
        // Register service worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(() => console.log('Service Worker registered'))
                .catch(err => console.error('Service Worker registration failed:', err));
        }
    }

    initUI() {
        // Update UI with saved state
        this.state.updateUI();
        
        // Set active page
        this.setActivePage(this.state.currentPage);
        
        // Initialize theme toggle
        const themeToggle = document.getElementById('themeToggle');
        themeToggle.addEventListener('click', () => {
            const newTheme = this.state.settings.theme === 'light' ? 'dark' : 'light';
            this.state.updateSettings({ theme: newTheme });
            themeToggle.innerHTML = newTheme === 'dark' ? 
                '<i class="fas fa-sun"></i>' : 
                '<i class="fas fa-moon"></i>';
        });
        
        // Set correct theme icon
        themeToggle.innerHTML = this.state.settings.theme === 'dark' ? 
            '<i class="fas fa-sun"></i>' : 
            '<i class="fas fa-moon"></i>';
    }

    initEvents() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.setActivePage(page);
            });
        });
        
        // Mobile menu
        document.querySelector('.mobile-menu-btn').addEventListener('click', () => {
            document.querySelector('.main-nav').classList.toggle('active');
        });
        
        // Global search
        document.getElementById('globalSearch').addEventListener('input', (e) => {
            this.filterPlaces(e.target.value);
        });
        
        document.querySelector('.search-btn').addEventListener('click', () => {
            this.filterPlaces(document.getElementById('globalSearch').value);
        });
        
        // Filters
        document.querySelectorAll('.filter-options input').forEach(input => {
            input.addEventListener('change', () => {
                this.mapManager.filterMarkers();
            });
        });
        
        document.getElementById('regionFilter').addEventListener('change', () => {
            this.mapManager.filterMarkers();
        });
        
        document.getElementById('ratingFilter').addEventListener('input', (e) => {
            document.getElementById('currentRating').textContent = `${e.target.value}★`;
            this.mapManager.filterMarkers();
        });
        
        // View toggle
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.target.dataset.view;
                this.toggleView(view);
            });
        });
        
        // Modal
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal());
        });
        
        document.getElementById('modalOverlay').addEventListener('click', () => this.closeModal());
        
        // Auth forms
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });
        
        document.getElementById('registerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.register();
        });
        
        // Auth tabs
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchAuthTab(tabName);
            });
        });
        
        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        document.getElementById('profileLogoutBtn').addEventListener('click', () => this.logout());
        
        // Explore button
        document.getElementById('exploreBtn').addEventListener('click', () => {
            this.setActivePage('places');
        });
        
        // Add place button
        document.getElementById('addPlaceBtn').addEventListener('click', () => {
            this.showAddPlaceModal();
        });
        
        // Add review button
        document.getElementById('addReviewBtn').addEventListener('click', () => {
            this.showAddReviewModal();
        });
        
        // Profile tabs
        document.querySelectorAll('.profile-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchProfileTab(tabName);
            });
        });
        
        // Save settings
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.saveSettings();
        });
    }

    initMap() {
        this.mapManager.init();
    }

    async loadData() {
        await Promise.all([
            this.reviewsManager.loadReviews(),
            this.loadRoutes()
        ]);
    }

    async loadRoutes() {
        // Mock routes data
        this.routes = [
            {
                id: 1,
                name: 'Мангистау: По следам древних цивилизаций',
                duration: '3 дня',
                distance: '450 км',
                places: [1, 5],
                difficulty: 'средняя',
                description: 'Маршрут по уникальным природным объектам Мангистауской области'
            },
            {
                id: 2,
                name: 'Алматы и окрестности',
                duration: '2 дня',
                distance: '300 км',
                places: [2, 5],
                difficulty: 'легкая',
                description: 'Классический маршрут по главным достопримечательностям Алматинской области'
            }
        ];
        
        this.renderRoutes();
    }

    setActivePage(page) {
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-page="${page}"]`).classList.add('active');
        
        // Update sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(`${page}Section`).classList.add('active');
        
        // Close mobile menu
        document.querySelector('.main-nav').classList.remove('active');
        
        this.state.currentPage = page;
    }

    toggleView(view) {
        const gridContainer = document.getElementById('placesGrid');
        const listContainer = document.getElementById('placesList');
        const viewBtns = document.querySelectorAll('.view-btn');
        
        viewBtns.forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        if (view === 'grid') {
            gridContainer.style.display = 'grid';
            listContainer.style.display = 'none';
        } else {
            gridContainer.style.display = 'none';
            listContainer.style.display = 'flex';
        }
    }

    filterPlaces(searchTerm) {
        const term = searchTerm.toLowerCase();
        const places = this.mapManager.places;
        
        const filtered = places.filter(place =>
            place.name.toLowerCase().includes(term) ||
            place.region.toLowerCase().includes(term) ||
            place.description.toLowerCase().includes(term)
        );
        
        // Update map markers
        places.forEach(place => {
            const visible = filtered.some(p => p.id === place.id);
            if (visible) {
                this.mapManager.markers.addLayer(place.marker);
            } else {
                this.mapManager.markers.removeLayer(place.marker);
            }
        });
        
        this.mapManager.updateMapStats();
    }

    showPlaceDetails(placeId) {
        const place = this.mapManager.places.find(p => p.id === placeId);
        if (!place) return;
        
        const isFavorite = this.state.favorites.includes(placeId);
        const isVisited = this.state.visited.includes(placeId);
        
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <div class="place-details">
                <div class="place-details-header">
                    <div class="place-details-image" style="background-image: url('${place.image}')"></div>
                    <div class="place-details-title">
                        <h2>${place.name}</h2>
                        <div class="place-details-meta">
                            <span><i class="fas fa-map-marker-alt"></i> ${place.region}</span>
                            <span><i class="fas fa-star"></i> ${place.rating}/5</span>
                            ${isVisited ? '<span class="visited-badge"><i class="fas fa-check-circle"></i> Посещено</span>' : ''}
                        </div>
                    </div>
                </div>
                
                <div class="place-details-content">
                    <div class="place-details-info">
                        <h3><i class="fas fa-info-circle"></i> Описание</h3>
                        <p>${place.description}</p>
                        
                        <h3><i class="fas fa-map-signs"></i> Как добраться</h3>
                        <p>Детальная информация о том, как добраться до места, будет добавлена позже.</p>
                        
                        <h3><i class="fas fa-clock"></i> Время работы</h3>
                        <p>Круглосуточно</p>
                    </div>
                    
                    <div class="place-details-sidebar">
                        <div class="details-actions">
                            <button class="btn btn-primary" onclick="app.playAudio(${place.id})">
                                <i class="fas fa-play"></i> Аудиогид
                            </button>
                            <button class="btn ${isFavorite ? 'btn-danger' : 'btn-outline'}" 
                                    onclick="app.toggleFavorite(${place.id})">
                                <i class="fas fa-heart"></i> ${isFavorite ? 'Удалить из избранного' : 'В избранное'}
                            </button>
                            <button class="btn btn-secondary" onclick="app.addToRoute(${place.id})">
                                <i class="fas fa-route"></i> В маршрут
                            </button>
                        </div>
                        
                        <div class="weather-widget">
                            <h4><i class="fas fa-cloud-sun"></i> Погода</h4>
                            <div class="weather-info">
                                <div class="weather-temp">+15°C</div>
                                <div class="weather-desc">Солнечно</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.openModal('placeModal');
        this.state.addVisited(placeId);
        this.updateVisitedCount();
    }

    toggleFavorite(placeId) {
        const added = this.state.toggleFavorite(placeId);
        this.state.updateUI();
        
        // Update favorite buttons
        document.querySelectorAll(`[onclick*="app.toggleFavorite(${placeId})"]`).forEach(btn => {
            const icon = btn.querySelector('i');
            if (added) {
                btn.classList.add('active');
                icon.style.color = '#f44336';
            } else {
                btn.classList.remove('active');
                icon.style.color = '';
            }
        });
        
        this.showNotification(
            added ? 'Добавлено в избранное' : 'Удалено из избранного',
            'success'
        );
    }

    playAudio(placeId) {
        const place = this.mapManager.places.find(p => p.id === placeId);
        if (place) {
            this.audioPlayer.play(place);
        }
    }

    addToRoute(placeId) {
        this.showNotification('Место добавлено в маршрут', 'success');
    }

    async login() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        // Mock login - in production, validate with backend
        if (email && password) {
            const user = {
                id: 1,
                name: email.split('@')[0],
                email: email,
                avatar: email.charAt(0).toUpperCase()
            };
            
            this.state.saveUser(user);
            this.closeModal();
            this.showNotification('Успешный вход!', 'success');
        } else {
            this.showNotification('Заполните все поля', 'error');
        }
    }

    async register() {
        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const confirm = document.getElementById('registerConfirm').value;
        
        if (!name || !email || !password || !confirm) {
            this.showNotification('Заполните все поля', 'error');
            return;
        }
        
        if (password !== confirm) {
            this.showNotification('Пароли не совпадают', 'error');
            return;
        }
        
        // Mock registration
        const user = {
            id: Date.now(),
            name: name,
            email: email,
            avatar: name.charAt(0).toUpperCase()
        };
        
        this.state.saveUser(user);
        this.closeModal();
        this.showNotification('Регистрация успешна!', 'success');
    }

    logout() {
        this.state.logout();
        this.showNotification('Вы вышли из системы', 'info');
    }

    switchAuthTab(tabName) {
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        document.getElementById('loginForm').style.display = 
            tabName === 'login' ? 'block' : 'none';
        document.getElementById('registerForm').style.display = 
            tabName === 'register' ? 'block' : 'none';
    }

    switchProfileTab(tabName) {
        document.querySelectorAll('.profile-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        event.target.classList.add('active');
        
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        document.getElementById(`tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
    }

    saveSettings() {
        const settings = {
            notifications: document.getElementById('notificationsToggle').checked,
            theme: document.getElementById('darkModeToggle').checked ? 'dark' : 'light',
            autoPlay: document.getElementById('autoPlayToggle').checked,
            offlineMode: document.getElementById('offlineModeToggle').checked
        };
        
        this.state.updateSettings(settings);
        this.showNotification('Настройки сохранены', 'success');
    }

    showAddPlaceModal() {
        if (!this.state.user) {
            this.showNotification('Войдите, чтобы добавлять места', 'warning');
            return;
        }
        
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <h3>Добавить новое место</h3>
            <form id="addPlaceForm">
                <div class="form-group">
                    <label>Название места</label>
                    <input type="text" id="placeName" required>
                </div>
                <div class="form-group">
                    <label>Регион</label>
                    <select id="placeRegion" required>
                        <option value="">Выберите регион</option>
                        <option value="Алматы">Алматы</option>
                        <option value="Астана">Астана</option>
                        <option value="Мангистау">Мангистау</option>
                        <option value="Алматинская область">Алматинская область</option>
                        <option value="Жамбылская область">Жамбылская область</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Категория</label>
                    <select id="placeCategory" required>
                        <option value="">Выберите категорию</option>
                        <option value="nature">Природа</option>
                        <option value="history">История</option>
                        <option value="culture">Культура</option>
                        <option value="architecture">Архитектура</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Описание</label>
                    <textarea id="placeDescription" rows="4" required></textarea>
                </div>
                <div class="form-group">
                    <label>Координаты (широта, долгота)</label>
                    <input type="text" id="placeCoordinates" placeholder="43.5, 52.0" required>
                </div>
                <div class="form-group">
                    <label>Ссылка на изображение</label>
                    <input type="url" id="placeImage" placeholder="https://example.com/image.jpg">
                </div>
                <button type="submit" class="btn btn-primary btn-block">Добавить место</button>
            </form>
        `;
        
        document.getElementById('addPlaceForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addNewPlace();
        });
        
        this.openModal('addPlaceModal');
    }

    addNewPlace() {
        // Implementation for adding new place
        this.showNotification('Место отправлено на модерацию', 'success');
        this.closeModal();
    }

    showAddReviewModal(placeId = null) {
        if (!this.state.user) {
            this.showNotification('Войдите, чтобы оставлять отзывы', 'warning');
            return;
        }
        
        const modalBody = document.getElementById('modalBody');
        let placeSelect = '';
        
        if (!placeId) {
            placeSelect = `
                <div class="form-group">
                    <label>Место</label>
                    <select id="reviewPlace" required>
                        <option value="">Выберите место</option>
                        ${this.mapManager.places.map(place => 
                            `<option value="${place.id}">${place.name}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
        }
        
        modalBody.innerHTML = `
            <h3>Добавить отзыв</h3>
            <form id="addReviewForm">
                ${placeSelect}
                <div class="form-group">
                    <label>Рейтинг</label>
                    <div class="rating-stars">
                        ${[1,2,3,4,5].map(i => `
                            <input type="radio" id="star${i}" name="rating" value="${i}" ${i === 5 ? 'checked' : ''}>
                            <label for="star${i}" title="${i} звезд">★</label>
                        `).join('')}
                    </div>
                </div>
                <div class="form-group">
                    <label>Ваш отзыв</label>
                    <textarea id="reviewComment" rows="4" required placeholder="Поделитесь своими впечатлениями..."></textarea>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Опубликовать отзыв</button>
            </form>
        `;
        
        document.getElementById('addReviewForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const placeIdToUse = placeId || parseInt(document.getElementById('reviewPlace').value);
            const rating = parseInt(document.querySelector('input[name="rating"]:checked').value);
            const comment = document.getElementById('reviewComment').value;
            
            if (placeIdToUse && rating && comment) {
                this.reviewsManager.addReview(placeIdToUse, rating, comment);
            }
        });
        
        this.openModal('addReviewModal');
    }

    renderRoutes() {
        const container = document.getElementById('routesGrid');
        container.innerHTML = '';
        
        this.routes.forEach(route => {
            const routeCard = document.createElement('div');
            routeCard.className = 'route-card';
            routeCard.innerHTML = `
                <div class="route-header">
                    <h3>${route.name}</h3>
                    <span class="route-difficulty ${route.difficulty}">${route.difficulty}</span>
                </div>
                <div class="route-stats">
                    <div class="route-stat">
                        <i class="fas fa-clock"></i>
                        <div>${route.duration}</div>
                    </div>
                    <div class="route-stat">
                        <i class="fas fa-road"></i>
                        <div>${route.distance}</div>
                    </div>
                    <div class="route-stat">
                        <i class="fas fa-map-marker-alt"></i>
                        <div>${route.places.length} мест</div>
                    </div>
                </div>
                <p class="route-description">${route.description}</p>
                <div class="route-actions">
                    <button class="btn btn-primary" onclick="app.startRoute(${route.id})">
                        <i class="fas fa-play"></i> Начать маршрут
                    </button>
                    <button class="btn btn-outline" onclick="app.saveRoute(${route.id})">
                        <i class="fas fa-bookmark"></i> Сохранить
                    </button>
                </div>
            `;
            container.appendChild(routeCard);
        });
    }

    startRoute(routeId) {
        const route = this.routes.find(r => r.id === routeId);
        if (route) {
            // Zoom map to show all places in route
            const bounds = route.places
                .map(placeId => {
                    const place = this.mapManager.places.find(p => p.id === placeId);
                    return place ? [place.lat, place.lng] : null;
                })
                .filter(Boolean);
            
            if (bounds.length > 0) {
                this.mapManager.map.fitBounds(bounds);
            }
            
            this.showNotification(`Маршрут "${route.name}" начат!`, 'success');
        }
    }

    openModal(modalId) {
        document.getElementById('modalOverlay').style.display = 'block';
        document.getElementById(modalId).classList.add('active');
    }

    closeModal() {
        document.getElementById('modalOverlay').style.display = 'none';
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : 
                                 type === 'error' ? 'exclamation-circle' : 
                                 type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    updateVisitedCount() {
        document.getElementById('visitedCount').textContent = this.state.visited.length;
        document.getElementById('myReviewsCount').textContent = this.reviewsManager.reviews.filter(
            r => r.userId === (this.state.user?.id || 0)
        ).length;
    }

    likeReview(reviewId) {
        const review = this.reviewsManager.reviews.find(r => r.id === reviewId);
        if (review) {
            review.likes++;
            this.reviewsManager.renderReviews();
            this.showNotification('Спасибо за вашу оценку!', 'success');
        }
    }

    replyToReview(reviewId) {
        this.showNotification('Функция ответов на отзывы скоро будет доступна', 'info');
    }
}

// ===== INITIALIZE APP =====
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new GeoTrackApp();
});

// Global functions for HTML onclick handlers
window.app = {
    showPlaceDetails: (id) => app.showPlaceDetails(id),
    toggleFavorite: (id) => app.toggleFavorite(id),
    playAudio: (id) => app.playAudio(id),
    addToRoute: (id) => app.addToRoute(id),
    login: () => app.login(),
    logout: () => app.logout(),
    closeModal: () => app.closeModal(),
    likeReview: (id) => app.likeReview(id),
    replyToReview: (id) => app.replyToReview(id),
    startRoute: (id) => app.startRoute(id),
    saveRoute: (id) => app.saveRoute(id)
};
// Добавить кнопку контактов в навигацию
function addContactButtonToNav() {
    const navMain = document.querySelector('.nav-main');
    const contactBtn = document.createElement('button');
    contactBtn.className = 'nav-btn';
    contactBtn.innerHTML = '<i class="fas fa-envelope"></i> Контакты';
    contactBtn.onclick = () => showSection('contact');
    navMain.appendChild(contactBtn);
}

// Вызовите эту функцию при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // ... остальной код инициализации ...
    addContactButtonToNav();
});

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
