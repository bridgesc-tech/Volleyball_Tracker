// Volleyball Tracker Application
class VolleyballTracker {
    constructor() {
        this.homePlayers = [];
        this.awayPlayers = [];
        this.currentTeam = 'home'; // 'home' or 'away'
        this.firebaseEnabled = false;
        this.gameId = this.getOrCreateGameId();
        this.gameName = this.loadGameName();
        
        // Current shot tracking state
        this.currentPlayerId = null;
        this.currentShotId = null; // For shot details modal
        this.selectedShotType = null;
        this.selectedShotResult = null;
        this.pendingShotPosition = null;
        this.currentSet = 1; // Default to set 1
        this.selectedPlayerFilter = null; // null = all players, otherwise player ID
        this.resultTypeFilters = {
            'success': true,
            'error': true,
            'blocked': true,
            'other': true
        };
        
        // Map shot results to filter categories
        this.resultCategoryMap = {
            'ace': 'success',
            'kill': 'success',
            'block-kill': 'success',
            'attack-kill': 'success',
            'service-point': 'success',
            'dig-success': 'success',
            'set-assist': 'success',
            'service-error': 'error',
            'spike-error': 'error',
            'block-error': 'error',
            'dig-error': 'error',
            'set-error': 'error',
            'attack-error': 'error',
            'block-miss': 'error',
            'spike-blocked': 'blocked',
            'attack-blocked': 'blocked',
            'block-touch': 'blocked',
            'spike-dug': 'other',
            'attack-dug': 'other',
            'dig-out': 'other',
            'set-over': 'other',
            'service-returned': 'other'
        };
        
        // Shot types and their possible results
        this.shotTypes = {
            'serve': ['ace', 'service-error', 'service-point', 'service-returned'],
            'spike': ['kill', 'spike-error', 'spike-blocked', 'spike-dug'],
            'block': ['block-kill', 'block-error', 'block-touch', 'block-miss'],
            'dig': ['dig-success', 'dig-error', 'dig-out'],
            'set': ['set-assist', 'set-error', 'set-over'],
            'attack': ['attack-kill', 'attack-error', 'attack-blocked', 'attack-dug']
        };
        
        // Current view (court, players, or stats)
        this.currentView = 'court';
        
        // Wait for Firebase scripts to load, then initialize
        this.waitForFirebase(() => {
            this.initializeFirebase();
            this.loadPlayers().then(() => {
                this.initializeApp();
            }).catch(error => {
                console.error('Error loading players:', error);
                this.initializeApp();
            });
        });
    }
    
    // Getter for current team's players
    get players() {
        return this.currentTeam === 'home' ? this.homePlayers : this.awayPlayers;
    }
    
    // Setter for current team's players
    set players(value) {
        if (this.currentTeam === 'home') {
            this.homePlayers = value;
        } else {
            this.awayPlayers = value;
        }
    }

    waitForFirebase(callback, attempts = 0) {
        const maxAttempts = 20;
        if (typeof firebase !== 'undefined' || attempts >= maxAttempts) {
            callback();
        } else {
            setTimeout(() => {
                this.waitForFirebase(callback, attempts + 1);
            }, 100);
        }
    }

    // Get or create a unique 6-digit game ID for syncing
    getOrCreateGameId() {
        let gameId = localStorage.getItem('volleyballTrackerGameId');
        if (!gameId) {
            gameId = Math.floor(100000 + Math.random() * 900000).toString();
            localStorage.setItem('volleyballTrackerGameId', gameId);
        }
        return gameId;
    }

    loadGameName() {
        return localStorage.getItem('volleyballTrackerGameName') || '';
    }

    saveGameName(name) {
        this.gameName = name;
        localStorage.setItem('volleyballTrackerGameName', name);
        if (this.firebaseEnabled) {
            db.collection('volleyballTrackerGames').doc(this.gameId).set({
                gameName: name,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        this.updateGameNameDisplay();
    }

    // Initialize Firebase connection
    initializeFirebase() {
        const checkFirebase = () => {
            if (typeof window !== 'undefined' && typeof db !== 'undefined' && db !== null) {
                this.firebaseEnabled = true;
                console.log('Firebase sync enabled for game:', this.gameId);
                
                // Listen for real-time updates
                db.collection('volleyballTrackerGames').doc(this.gameId)
                    .onSnapshot((docSnapshot) => {
                        if (docSnapshot.exists) {
                            const data = docSnapshot.data();
                            if (data.gameName) {
                                this.gameName = data.gameName;
                                localStorage.setItem('volleyballTrackerGameName', this.gameName);
                                this.updateGameNameDisplay();
                            }
                            if (data.homePlayers && data.awayPlayers) {
                                this.homePlayers = data.homePlayers || [];
                                this.awayPlayers = data.awayPlayers || [];
                                this.saveToLocalStorage();
                                this.renderPlayers();
                                this.renderPlayerFilter();
                                this.renderCourt();
                                console.log('Synced from cloud');
                            }
                        }
                    }, (error) => {
                        console.error('Firebase sync error:', error);
                    });
                
                this.updateSyncStatus();
                return true;
            }
            return false;
        };
        
        if (!checkFirebase()) {
            setTimeout(() => {
                if (!checkFirebase()) {
                    console.log('Firebase not configured - running in local-only mode');
                    this.updateSyncStatus();
                }
            }, 500);
        }
    }

    async loadPlayers() {
        if (this.firebaseEnabled) {
            try {
                const docSnapshot = await db.collection('volleyballTrackerGames').doc(this.gameId).get();
                if (docSnapshot.exists) {
                    const data = docSnapshot.data();
                    if (data.homePlayers && data.awayPlayers) {
                        this.homePlayers = data.homePlayers || [];
                        this.awayPlayers = data.awayPlayers || [];
                    }
                    this.saveToLocalStorage();
                    if (data.gameName) {
                        this.gameName = data.gameName;
                        localStorage.setItem('volleyballTrackerGameName', this.gameName);
                        this.updateGameNameDisplay();
                    }
                    return this.players;
                }
            } catch (error) {
                console.error('Error loading from Firebase:', error);
            }
        }
        
        // Load from localStorage
        const storedHome = localStorage.getItem('volleyballTrackerHomePlayers');
        this.homePlayers = storedHome ? JSON.parse(storedHome) : [];
        
        const storedAway = localStorage.getItem('volleyballTrackerAwayPlayers');
        this.awayPlayers = storedAway ? JSON.parse(storedAway) : [];
        
        return this.players;
    }

    savePlayers() {
        this.saveToLocalStorage();
        
        if (this.firebaseEnabled) {
            db.collection('volleyballTrackerGames').doc(this.gameId).set({
                homePlayers: this.homePlayers,
                awayPlayers: this.awayPlayers,
                gameName: this.gameName,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true })
            .then(() => {
                console.log('Players saved to Firebase');
            })
            .catch((error) => {
                console.error('Error saving to Firebase:', error);
            });
        }
    }

    saveToLocalStorage() {
        localStorage.setItem('volleyballTrackerHomePlayers', JSON.stringify(this.homePlayers));
        localStorage.setItem('volleyballTrackerAwayPlayers', JSON.stringify(this.awayPlayers));
    }

    updateSyncStatus() {
        const statusEl = document.getElementById('syncStatus');
        if (!statusEl) return;
        
        if (this.firebaseEnabled) {
            statusEl.innerHTML = '☁️ Synced';
            statusEl.style.color = '#52C41A';
        } else if (window.location.protocol === 'file:') {
            statusEl.innerHTML = '📁 Local';
            statusEl.style.color = '#FAAD14';
        } else {
            statusEl.innerHTML = '⚪ Offline';
            statusEl.style.color = '#7F8C8D';
        }
    }

    updateGameNameDisplay() {
        const displayEl = document.getElementById('gameNameDisplay');
        if (displayEl) {
            if (this.gameName) {
                displayEl.textContent = this.gameName;
                displayEl.style.display = 'block';
            } else {
                displayEl.style.display = 'none';
            }
        }
    }

    initializeApp() {
        this.updateSyncStatus();
        this.updateGameNameDisplay();
        this.setupViewToggle();
        this.setupTeamSwitch();
        this.setupSetSelector();
        this.setupPlayerFilter();
        this.setupResultTypeFilter();
        this.setupCourtClick();
        this.setupShotModal();
        this.setupShotDetailsModal();
        this.setupPlayerStatsModal();
        this.renderPlayers();
        this.renderPlayerFilter();
        this.renderCourt();
        
        // Add player button
        document.getElementById('addPlayerBtn').addEventListener('click', () => this.addPlayer());
        document.getElementById('playerNumberInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addPlayer();
        });
        
        // Clear court button
        document.getElementById('clearCourtBtn').addEventListener('click', () => this.clearCourt());
    }

    setupViewToggle() {
        document.getElementById('courtViewBtn').addEventListener('click', () => this.switchView('court'));
        document.getElementById('playersViewBtn').addEventListener('click', () => this.switchView('players'));
        document.getElementById('statsViewBtn').addEventListener('click', () => this.switchView('stats'));
    }

    switchView(view) {
        this.currentView = view;
        
        // Hide all views
        document.getElementById('courtView').style.display = 'none';
        document.getElementById('playersView').style.display = 'none';
        document.getElementById('statsView').style.display = 'none';
        
        // Remove active class from all buttons
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        
        // Show selected view and activate button
        if (view === 'court') {
            document.getElementById('courtView').style.display = 'block';
            document.getElementById('courtViewBtn').classList.add('active');
            this.renderPlayerFilter();
            this.renderCourt();
        } else if (view === 'players') {
            document.getElementById('playersView').style.display = 'block';
            document.getElementById('playersViewBtn').classList.add('active');
            this.renderPlayers();
        } else if (view === 'stats') {
            document.getElementById('statsView').style.display = 'block';
            document.getElementById('statsViewBtn').classList.add('active');
            this.renderStats();
        }
    }

    setupTeamSwitch() {
        const btn = document.getElementById('teamSwitchBtn');
        btn.addEventListener('click', () => {
            this.currentTeam = this.currentTeam === 'home' ? 'away' : 'home';
            btn.textContent = this.currentTeam === 'home' ? 'Home Team' : 'Away Team';
            btn.classList.toggle('active-away', this.currentTeam === 'away');
            // Reset filter when switching teams
            this.selectedPlayerFilter = null;
            this.renderPlayers();
            this.renderPlayerFilter();
            this.renderCourt();
        });
    }

    setupSetSelector() {
        for (let i = 1; i <= 5; i++) {
            const btn = document.getElementById(`set${i}Btn`);
            if (btn) {
                btn.addEventListener('click', () => {
                    this.currentSet = i;
                    document.querySelectorAll('.set-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.renderCourt();
                });
            }
        }
        // Set initial active set
        document.getElementById('set1Btn').classList.add('active');
    }

    setupPlayerFilter() {
        // "All Players" button
        document.getElementById('filterAllBtn').addEventListener('click', () => {
            this.selectedPlayerFilter = null;
            document.querySelectorAll('.player-filter-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('filterAllBtn').classList.add('active');
            this.renderCourt();
        });
    }

    setupResultTypeFilter() {
        // Setup checkbox listeners
        document.querySelectorAll('.result-filter-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const resultType = checkbox.dataset.resultType;
                this.resultTypeFilters[resultType] = checkbox.checked;
                this.renderCourt();
            });
        });
    }

    setupCourtClick() {
        const court = document.getElementById('volleyballCourt');
        court.addEventListener('click', (e) => {
            // Check if click is on a shot marker (group or any element inside it)
            if (e.target.classList.contains('shot-marker') || 
                e.target.closest('.shot-marker')) {
                return; // Don't trigger on existing markers
            }
            
            // Hide tooltip when clicking on court
            this.hideShotTooltip();
            
            const rect = court.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 200;
            const y = ((e.clientY - rect.top) / rect.height) * 300;
            
            this.pendingShotPosition = { x, y };
            this.openPlayerSelect();
        });
    }

    openPlayerSelect() {
        if (this.players.length === 0) {
            alert('Please add players first in the Players tab.');
            return;
        }
        
        const overlay = document.getElementById('playerSelectOverlay');
        const list = document.getElementById('playerSelectList');
        list.innerHTML = '';
        
        this.players.forEach(player => {
            const item = document.createElement('div');
            item.className = 'player-select-item';
            item.textContent = `#${player.number} - ${player.name}`;
            item.addEventListener('click', () => {
                this.currentPlayerId = player.id;
                this.closePlayerSelect();
                this.openShotModal();
            });
            list.appendChild(item);
        });
        
        overlay.style.display = 'flex';
    }

    closePlayerSelect(cancelled = false) {
        document.getElementById('playerSelectOverlay').style.display = 'none';
        if (cancelled) {
            this.pendingShotPosition = null;
            this.currentPlayerId = null;
        }
    }

    openShotModal() {
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player) return;
        
        document.getElementById('modalPlayerNumber').textContent = `#${player.number} - ${player.name}`;
        document.getElementById('shotModal').style.display = 'block';
        
        // Reset selections
        this.selectedShotType = null;
        this.selectedShotResult = null;
        document.querySelectorAll('.shot-type-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('shotResultSection').style.display = 'none';
        document.getElementById('recordShotBtn').style.display = 'none';
    }

    setupShotModal() {
        // Shot type buttons
        document.querySelectorAll('.shot-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedShotType = btn.dataset.type;
                document.querySelectorAll('.shot-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.showShotResults();
            });
        });
        
        // Close modal
        document.getElementById('closeModal').addEventListener('click', () => {
            document.getElementById('shotModal').style.display = 'none';
            this.resetShotState();
        });
        
        // Record shot button
        document.getElementById('recordShotBtn').addEventListener('click', () => {
            this.recordShot();
        });
    }

    showShotResults() {
        if (!this.selectedShotType) return;
        
        const results = this.shotTypes[this.selectedShotType];
        const container = document.getElementById('shotResultButtons');
        container.innerHTML = '';
        
        const resultLabels = {
            'ace': '🎯 Ace',
            'service-error': '❌ Service Error',
            'service-point': '✅ Service Point',
            'service-returned': '↩️ Service Returned',
            'kill': '💥 Kill',
            'spike-error': '❌ Spike Error',
            'spike-blocked': '🛡️ Spike Blocked',
            'spike-dug': '🤲 Spike Dug',
            'block-kill': '💥 Block Kill',
            'block-error': '❌ Block Error',
            'block-touch': '👆 Block Touch',
            'block-miss': '❌ Block Miss',
            'dig-success': '✅ Dig Success',
            'dig-error': '❌ Dig Error',
            'dig-out': '↗️ Dig Out',
            'set-assist': '✅ Set Assist',
            'set-error': '❌ Set Error',
            'set-over': '↗️ Set Over',
            'attack-kill': '💥 Attack Kill',
            'attack-error': '❌ Attack Error',
            'attack-blocked': '🛡️ Attack Blocked',
            'attack-dug': '🤲 Attack Dug'
        };
        
        results.forEach(result => {
            const btn = document.createElement('button');
            btn.className = 'shot-result-btn';
            btn.dataset.result = result;
            btn.textContent = resultLabels[result] || result;
            btn.addEventListener('click', () => {
                this.selectedShotResult = result;
                document.querySelectorAll('.shot-result-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('recordShotBtn').style.display = 'block';
            });
            container.appendChild(btn);
        });
        
        document.getElementById('shotResultSection').style.display = 'block';
    }

    recordShot() {
        if (!this.currentPlayerId || !this.selectedShotType || !this.selectedShotResult || !this.pendingShotPosition) {
            alert('Please complete all selections.');
            return;
        }
        
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player) return;
        
        // Initialize shots array if needed
        if (!player.shots) {
            player.shots = [];
        }
        
        // Create shot object
        const shot = {
            id: Date.now().toString(),
            type: this.selectedShotType,
            result: this.selectedShotResult,
            position: this.pendingShotPosition,
            set: this.currentSet,
            timestamp: new Date().toISOString()
        };
        
        player.shots.push(shot);
        this.savePlayers();
        this.renderCourt();
        this.renderPlayers();
        
        // Close modal and reset
        document.getElementById('shotModal').style.display = 'none';
        this.resetShotState();
    }

    resetShotState() {
        this.currentPlayerId = null;
        this.selectedShotType = null;
        this.selectedShotResult = null;
        this.pendingShotPosition = null;
    }

    setupShotDetailsModal() {
        document.getElementById('closeShotDetailsModal').addEventListener('click', () => {
            document.getElementById('shotDetailsModal').style.display = 'none';
        });
        
        document.getElementById('deleteShotBtn').addEventListener('click', () => {
            this.deleteShot();
        });
    }

    setupPlayerStatsModal() {
        document.getElementById('closePlayerStatsModal').addEventListener('click', () => {
            document.getElementById('playerStatsModal').style.display = 'none';
        });
    }

    deleteShot() {
        if (!this.currentShotId) return;
        
        const player = this.players.find(p => p.shots && p.shots.some(s => s.id === this.currentShotId));
        if (player && player.shots) {
            player.shots = player.shots.filter(s => s.id !== this.currentShotId);
            this.savePlayers();
            this.renderCourt();
            this.renderPlayers();
            document.getElementById('shotDetailsModal').style.display = 'none';
        }
    }

    renderPlayerFilter() {
        const filterBar = document.getElementById('playerFilterBar');
        if (!filterBar) return;
        
        // Remove existing player filter buttons (except "All Players")
        const allBtn = document.getElementById('filterAllBtn');
        filterBar.innerHTML = '';
        filterBar.appendChild(allBtn);
        
        // Add player filter buttons
        this.players.sort((a, b) => a.number - b.number).forEach(player => {
            const btn = document.createElement('button');
            btn.className = 'player-filter-btn';
            btn.setAttribute('data-player-id', player.id);
            btn.textContent = `#${player.number}`;
            btn.addEventListener('click', () => {
                this.selectedPlayerFilter = player.id;
                document.querySelectorAll('.player-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderCourt();
            });
            
            // Set active if this player is selected
            if (this.selectedPlayerFilter === player.id) {
                btn.classList.add('active');
                allBtn.classList.remove('active');
            }
            
            filterBar.appendChild(btn);
        });
        
        // Update "All Players" button active state
        if (this.selectedPlayerFilter === null) {
            allBtn.classList.add('active');
        }
    }

    renderCourt() {
        const court = document.getElementById('volleyballCourt');
        
        // Remove existing shot markers
        document.querySelectorAll('.shot-marker').forEach(marker => marker.remove());
        
        // Filter players if a specific player is selected
        const playersToShow = this.selectedPlayerFilter 
            ? this.players.filter(p => p.id === this.selectedPlayerFilter)
            : this.players;
        
        // Add shot markers for current set
        playersToShow.forEach(player => {
            if (player.shots) {
                player.shots
                    .filter(shot => shot.set === this.currentSet)
                    .filter(shot => {
                        // Filter by result type category
                        const category = this.resultCategoryMap[shot.result] || 'other';
                        return this.resultTypeFilters[category];
                    })
                    .forEach(shot => {
                        // Create a group to hold circle and text
                        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                        group.setAttribute('class', 'shot-marker');
                        group.setAttribute('data-player-id', player.id);
                        group.setAttribute('data-shot-id', shot.id);
                        
                        // Create circle
                        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        marker.setAttribute('cx', shot.position.x);
                        marker.setAttribute('cy', shot.position.y);
                        marker.setAttribute('r', '6'); // Smaller size to reduce crowding
                        
                        // Color based on result
                        const colors = {
                            'ace': '#52C41A',
                            'kill': '#52C41A',
                            'block-kill': '#52C41A',
                            'attack-kill': '#52C41A',
                            'service-point': '#52C41A',
                            'dig-success': '#52C41A',
                            'set-assist': '#52C41A',
                            'service-error': '#FF4D4F',
                            'spike-error': '#FF4D4F',
                            'block-error': '#FF4D4F',
                            'dig-error': '#FF4D4F',
                            'set-error': '#FF4D4F',
                            'attack-error': '#FF4D4F',
                            'block-miss': '#FF4D4F',
                            'spike-blocked': '#FAAD14',
                            'attack-blocked': '#FAAD14',
                            'block-touch': '#FAAD14',
                            'spike-dug': '#4169E1',
                            'attack-dug': '#4169E1',
                            'dig-out': '#4169E1',
                            'set-over': '#4169E1',
                            'service-returned': '#7F8C8D'
                        };
                        
                        marker.setAttribute('fill', colors[shot.result] || '#7F8C8D');
                        marker.setAttribute('stroke', '#FFFFFF');
                        marker.setAttribute('stroke-width', '0.5');
                        
                        // Create text element for player number
                        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        text.setAttribute('x', shot.position.x);
                        text.setAttribute('y', shot.position.y);
                        text.setAttribute('text-anchor', 'middle');
                        text.setAttribute('dominant-baseline', 'central');
                        text.setAttribute('fill', '#FFFFFF');
                        text.setAttribute('font-size', '7');
                        text.setAttribute('font-weight', 'bold');
                        text.setAttribute('pointer-events', 'none');
                        text.textContent = player.number;
                        
                        // Add circle and text to group
                        group.appendChild(marker);
                        group.appendChild(text);
                        
                        // Add hover tooltip
                        group.addEventListener('mouseenter', (e) => {
                            this.showShotTooltip(e, player, shot);
                        });
                        
                        group.addEventListener('mouseleave', () => {
                            this.hideShotTooltip();
                        });
                        
                        group.addEventListener('mousemove', (e) => {
                            this.updateTooltipPosition(e);
                        });
                        
                        group.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.showShotDetails(player, shot);
                        });
                        
                        court.appendChild(group);
                    });
            }
        });
    }

    showShotTooltip(event, player, shot) {
        const tooltip = document.getElementById('shotTooltip');
        if (!tooltip) return;
        
        const resultLabels = {
            'ace': 'Ace',
            'service-error': 'Service Error',
            'service-point': 'Service Point',
            'service-returned': 'Service Returned',
            'kill': 'Kill',
            'spike-error': 'Spike Error',
            'spike-blocked': 'Spike Blocked',
            'spike-dug': 'Spike Dug',
            'block-kill': 'Block Kill',
            'block-error': 'Block Error',
            'block-touch': 'Block Touch',
            'block-miss': 'Block Miss',
            'dig-success': 'Dig Success',
            'dig-error': 'Dig Error',
            'dig-out': 'Dig Out',
            'set-assist': 'Set Assist',
            'set-error': 'Set Error',
            'set-over': 'Set Over',
            'attack-kill': 'Attack Kill',
            'attack-error': 'Attack Error',
            'attack-blocked': 'Attack Blocked',
            'attack-dug': 'Attack Dug'
        };
        
        tooltip.innerHTML = `
            <div class="tooltip-player">#${player.number} - ${player.name}</div>
            <div class="tooltip-info">
                <span class="tooltip-label">Type:</span>${shot.type.charAt(0).toUpperCase() + shot.type.slice(1)}
            </div>
            <div class="tooltip-info">
                <span class="tooltip-label">Result:</span>${resultLabels[shot.result] || shot.result}
            </div>
        `;
        
        tooltip.style.display = 'block';
        this.updateTooltipPosition(event);
    }
    
    updateTooltipPosition(event) {
        const tooltip = document.getElementById('shotTooltip');
        if (!tooltip || tooltip.style.display === 'none') return;
        
        const courtWrapper = document.querySelector('.court-wrapper');
        if (courtWrapper) {
            const rect = courtWrapper.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            // Position tooltip above and to the right of the cursor
            tooltip.style.left = (x + 15) + 'px';
            tooltip.style.top = (y - 10) + 'px';
            
            // Adjust if tooltip goes off screen
            const tooltipRect = tooltip.getBoundingClientRect();
            const wrapperRect = courtWrapper.getBoundingClientRect();
            
            if (tooltipRect.right > wrapperRect.right) {
                tooltip.style.left = (x - tooltipRect.width - 15) + 'px';
            }
            
            if (tooltipRect.top < wrapperRect.top) {
                tooltip.style.top = (y + 20) + 'px';
            }
        } else {
            // Fallback positioning relative to viewport
            tooltip.style.left = (event.clientX + 15) + 'px';
            tooltip.style.top = (event.clientY - 10) + 'px';
        }
    }
    
    hideShotTooltip() {
        const tooltip = document.getElementById('shotTooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    showShotDetails(player, shot) {
        this.currentShotId = shot.id;
        document.getElementById('shotDetailsPlayerNumber').textContent = `#${player.number} - ${player.name}`;
        
        const resultLabels = {
            'ace': 'Ace',
            'service-error': 'Service Error',
            'service-point': 'Service Point',
            'service-returned': 'Service Returned',
            'kill': 'Kill',
            'spike-error': 'Spike Error',
            'spike-blocked': 'Spike Blocked',
            'spike-dug': 'Spike Dug',
            'block-kill': 'Block Kill',
            'block-error': 'Block Error',
            'block-touch': 'Block Touch',
            'block-miss': 'Block Miss',
            'dig-success': 'Dig Success',
            'dig-error': 'Dig Error',
            'dig-out': 'Dig Out',
            'set-assist': 'Set Assist',
            'set-error': 'Set Error',
            'set-over': 'Set Over',
            'attack-kill': 'Attack Kill',
            'attack-error': 'Attack Error',
            'attack-blocked': 'Attack Blocked',
            'attack-dug': 'Attack Dug'
        };
        
        const info = document.getElementById('shotDetailsInfo');
        info.innerHTML = `
            <div style="margin-bottom: 12px;">
                <strong>Shot Type:</strong> ${shot.type.charAt(0).toUpperCase() + shot.type.slice(1)}
            </div>
            <div style="margin-bottom: 12px;">
                <strong>Result:</strong> ${resultLabels[shot.result] || shot.result}
            </div>
            <div style="margin-bottom: 12px;">
                <strong>Set:</strong> ${shot.set}
            </div>
            <div>
                <strong>Time:</strong> ${new Date(shot.timestamp).toLocaleString()}
            </div>
        `;
        
        document.getElementById('shotDetailsModal').style.display = 'block';
    }

    clearCourt() {
        if (!confirm('Clear all shots for the current set?')) return;
        
        this.players.forEach(player => {
            if (player.shots) {
                player.shots = player.shots.filter(shot => shot.set !== this.currentSet);
            }
        });
        
        this.savePlayers();
        this.renderCourt();
        this.renderPlayers();
    }

    addPlayer() {
        const nameInput = document.getElementById('playerNameInput');
        const numberInput = document.getElementById('playerNumberInput');
        
        const name = nameInput.value.trim();
        const number = parseInt(numberInput.value);
        
        if (!name || isNaN(number) || number < 0 || number > 99) {
            alert('Please enter a valid name and number (0-99).');
            return;
        }
        
        // Check if number already exists
        if (this.players.some(p => p.number === number)) {
            alert('Player number already exists.');
            return;
        }
        
        const player = {
            id: Date.now().toString(),
            name: name,
            number: number,
            shots: []
        };
        
        this.players.push(player);
        this.savePlayers();
        this.renderPlayers();
        this.renderPlayerFilter();
        
        nameInput.value = '';
        numberInput.value = '';
        nameInput.focus();
    }

    renderPlayers() {
        const container = document.getElementById('playersList');
        const emptyState = document.getElementById('emptyState');
        
        if (this.players.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        container.innerHTML = '';
        
        this.players.sort((a, b) => a.number - b.number).forEach(player => {
            const card = document.createElement('div');
            card.className = 'player-card';
            
            const stats = this.calculatePlayerStats(player);
            
            card.innerHTML = `
                <div class="player-card-header">
                    <div class="player-name">${player.name}</div>
                    <div class="player-number">#${player.number}</div>
                </div>
                <div class="player-stats">
                    <div class="stat-item">
                        <div class="stat-label">Total Shots</div>
                        <div class="stat-value">${stats.total}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Kills/Aces</div>
                        <div class="stat-value">${stats.kills}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Errors</div>
                        <div class="stat-value">${stats.errors}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Success %</div>
                        <div class="stat-value">${stats.successRate}%</div>
                    </div>
                </div>
            `;
            
            // Add click handler to entire card
            card.addEventListener('click', () => {
                this.showPlayerStats(player);
            });
            
            container.appendChild(card);
        });
    }

    calculatePlayerStats(player) {
        if (!player.shots || player.shots.length === 0) {
            return { total: 0, kills: 0, errors: 0, successRate: 0 };
        }
        
        const total = player.shots.length;
        const kills = player.shots.filter(s => 
            s.result === 'kill' || s.result === 'ace' || s.result === 'block-kill' || s.result === 'attack-kill'
        ).length;
        const errors = player.shots.filter(s => 
            s.result.includes('error') || s.result === 'block-miss'
        ).length;
        const successes = player.shots.filter(s => 
            s.result === 'kill' || s.result === 'ace' || s.result === 'block-kill' || 
            s.result === 'attack-kill' || s.result === 'service-point' || s.result === 'dig-success' ||
            s.result === 'set-assist'
        ).length;
        
        const successRate = total > 0 ? Math.round((successes / total) * 100) : 0;
        
        return { total, kills, errors, successRate };
    }

    calculateDetailedPlayerStats(player) {
        if (!player.shots || player.shots.length === 0) {
            return {
                total: 0,
                bySet: {},
                byShotType: {},
                byResult: {},
                kills: 0,
                errors: 0,
                successes: 0,
                successRate: 0
            };
        }

        const stats = {
            total: player.shots.length,
            bySet: {},
            byShotType: {},
            byResult: {},
            kills: 0,
            errors: 0,
            successes: 0,
            successRate: 0
        };

        player.shots.forEach(shot => {
            // By set
            if (!stats.bySet[shot.set]) {
                stats.bySet[shot.set] = { total: 0, kills: 0, errors: 0, successes: 0 };
            }
            stats.bySet[shot.set].total++;

            // By shot type
            if (!stats.byShotType[shot.type]) {
                stats.byShotType[shot.type] = { total: 0, kills: 0, errors: 0, successes: 0 };
            }
            stats.byShotType[shot.type].total++;

            // By result
            if (!stats.byResult[shot.result]) {
                stats.byResult[shot.result] = 0;
            }
            stats.byResult[shot.result]++;

            // Count kills
            if (shot.result === 'kill' || shot.result === 'ace' || shot.result === 'block-kill' || shot.result === 'attack-kill') {
                stats.kills++;
                stats.bySet[shot.set].kills++;
                stats.byShotType[shot.type].kills++;
            }

            // Count errors
            if (shot.result.includes('error') || shot.result === 'block-miss') {
                stats.errors++;
                stats.bySet[shot.set].errors++;
                stats.byShotType[shot.type].errors++;
            }

            // Count successes
            if (shot.result === 'kill' || shot.result === 'ace' || shot.result === 'block-kill' || 
                shot.result === 'attack-kill' || shot.result === 'service-point' || shot.result === 'dig-success' ||
                shot.result === 'set-assist') {
                stats.successes++;
                stats.bySet[shot.set].successes++;
                stats.byShotType[shot.type].successes++;
            }
        });

        stats.successRate = stats.total > 0 ? Math.round((stats.successes / stats.total) * 100) : 0;

        // Calculate success rates for sets and shot types
        Object.keys(stats.bySet).forEach(set => {
            const setStats = stats.bySet[set];
            setStats.successRate = setStats.total > 0 ? Math.round((setStats.successes / setStats.total) * 100) : 0;
        });

        Object.keys(stats.byShotType).forEach(type => {
            const typeStats = stats.byShotType[type];
            typeStats.successRate = typeStats.total > 0 ? Math.round((typeStats.successes / typeStats.total) * 100) : 0;
        });

        return stats;
    }

    showPlayerStats(player) {
        document.getElementById('playerStatsPlayerNumber').textContent = `#${player.number} - ${player.name}`;
        
        const detailedStats = this.calculateDetailedPlayerStats(player);
        const content = document.getElementById('playerStatsContent');
        
        if (detailedStats.total === 0) {
            content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 12px; font-size: 13px;">No shots recorded yet.</p>';
            document.getElementById('playerStatsModal').style.display = 'block';
            return;
        }

        const resultLabels = {
            'ace': 'Ace',
            'service-error': 'Service Error',
            'service-point': 'Service Point',
            'service-returned': 'Service Returned',
            'kill': 'Kill',
            'spike-error': 'Spike Error',
            'spike-blocked': 'Spike Blocked',
            'spike-dug': 'Spike Dug',
            'block-kill': 'Block Kill',
            'block-error': 'Block Error',
            'block-touch': 'Block Touch',
            'block-miss': 'Block Miss',
            'dig-success': 'Dig Success',
            'dig-error': 'Dig Error',
            'dig-out': 'Dig Out',
            'set-assist': 'Set Assist',
            'set-error': 'Set Error',
            'set-over': 'Set Over',
            'attack-kill': 'Attack Kill',
            'attack-error': 'Attack Error',
            'attack-blocked': 'Attack Blocked',
            'attack-dug': 'Attack Dug'
        };

        const shotTypeLabels = {
            'serve': 'Serve',
            'spike': 'Spike',
            'block': 'Block',
            'dig': 'Dig',
            'set': 'Set',
            'attack': 'Attack'
        };

        let html = `
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px;">
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Total</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">${detailedStats.total}</div>
                </div>
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Success</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--success-color);">${detailedStats.successRate}%</div>
                </div>
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Kills</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--success-color);">${detailedStats.kills}</div>
                </div>
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Errors</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--danger-color);">${detailedStats.errors}</div>
                </div>
            </div>
        `;

        // Stats by Set
        const sets = Object.keys(detailedStats.bySet).sort((a, b) => parseInt(a) - parseInt(b));
        if (sets.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">By Set</h3>';
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 6px; margin-bottom: 12px;">';
            sets.forEach(set => {
                const setStats = detailedStats.bySet[set];
                html += `
                    <div style="padding: 6px; background: var(--bg-color); border-radius: 4px;">
                        <div style="font-weight: 600; font-size: 12px; margin-bottom: 2px;">Set ${set}</div>
                        <div style="font-size: 10px; color: var(--text-secondary); line-height: 1.3;">T:${setStats.total} K:${setStats.kills} E:${setStats.errors}</div>
                        <div style="font-size: 11px; color: var(--success-color); font-weight: 600;">${setStats.successRate}%</div>
                    </div>
                `;
            });
            html += '</div>';
        }

        // Stats by Shot Type
        const shotTypes = Object.keys(detailedStats.byShotType).sort();
        if (shotTypes.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">By Shot Type</h3>';
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 6px; margin-bottom: 12px;">';
            shotTypes.forEach(type => {
                const typeStats = detailedStats.byShotType[type];
                html += `
                    <div style="padding: 6px; background: var(--bg-color); border-radius: 4px;">
                        <div style="font-weight: 600; font-size: 12px; margin-bottom: 2px;">${shotTypeLabels[type] || type}</div>
                        <div style="font-size: 10px; color: var(--text-secondary); line-height: 1.3;">T:${typeStats.total} K:${typeStats.kills} E:${typeStats.errors}</div>
                        <div style="font-size: 11px; color: var(--success-color); font-weight: 600;">${typeStats.successRate}%</div>
                    </div>
                `;
            });
            html += '</div>';
        }

        // Top Results
        const results = Object.entries(detailedStats.byResult)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);
        if (results.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">Top Results</h3>';
            html += '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">';
            results.forEach(([result, count]) => {
                html += `
                    <div style="display: flex; justify-content: space-between; padding: 6px; background: var(--bg-color); border-radius: 4px; font-size: 11px;">
                        <span>${resultLabels[result] || result}</span>
                        <span style="font-weight: 600;">${count}</span>
                    </div>
                `;
            });
            html += '</div>';
        }

        content.innerHTML = html;
        document.getElementById('playerStatsModal').style.display = 'block';
    }

    calculateTeamStats() {
        const teamStats = {
            total: 0,
            kills: 0,
            errors: 0,
            successes: 0,
            successRate: 0,
            bySet: {},
            byShotType: {},
            byResult: {},
            byPlayer: {}
        };

        this.players.forEach(player => {
            if (!player.shots || player.shots.length === 0) return;

            const playerStats = this.calculateDetailedPlayerStats(player);
            teamStats.total += playerStats.total;
            teamStats.kills += playerStats.kills;
            teamStats.errors += playerStats.errors;
            teamStats.successes += playerStats.successes;

            // By player
            teamStats.byPlayer[player.id] = {
                name: player.name,
                number: player.number,
                total: playerStats.total,
                kills: playerStats.kills,
                errors: playerStats.errors,
                successRate: playerStats.successRate
            };

            // Aggregate by set
            Object.keys(playerStats.bySet).forEach(set => {
                if (!teamStats.bySet[set]) {
                    teamStats.bySet[set] = { total: 0, kills: 0, errors: 0, successes: 0 };
                }
                teamStats.bySet[set].total += playerStats.bySet[set].total;
                teamStats.bySet[set].kills += playerStats.bySet[set].kills;
                teamStats.bySet[set].errors += playerStats.bySet[set].errors;
                teamStats.bySet[set].successes += playerStats.bySet[set].successes;
            });

            // Aggregate by shot type
            Object.keys(playerStats.byShotType).forEach(type => {
                if (!teamStats.byShotType[type]) {
                    teamStats.byShotType[type] = { total: 0, kills: 0, errors: 0, successes: 0 };
                }
                teamStats.byShotType[type].total += playerStats.byShotType[type].total;
                teamStats.byShotType[type].kills += playerStats.byShotType[type].kills;
                teamStats.byShotType[type].errors += playerStats.byShotType[type].errors;
                teamStats.byShotType[type].successes += playerStats.byShotType[type].successes;
            });

            // Aggregate by result
            Object.keys(playerStats.byResult).forEach(result => {
                if (!teamStats.byResult[result]) {
                    teamStats.byResult[result] = 0;
                }
                teamStats.byResult[result] += playerStats.byResult[result];
            });
        });

        teamStats.successRate = teamStats.total > 0 ? Math.round((teamStats.successes / teamStats.total) * 100) : 0;

        // Calculate success rates
        Object.keys(teamStats.bySet).forEach(set => {
            const setStats = teamStats.bySet[set];
            setStats.successRate = setStats.total > 0 ? Math.round((setStats.successes / setStats.total) * 100) : 0;
        });

        Object.keys(teamStats.byShotType).forEach(type => {
            const typeStats = teamStats.byShotType[type];
            typeStats.successRate = typeStats.total > 0 ? Math.round((typeStats.successes / typeStats.total) * 100) : 0;
        });

        return teamStats;
    }

    renderStats() {
        const container = document.getElementById('statsContainer');
        const teamStats = this.calculateTeamStats();

        const shotTypeLabels = {
            'serve': 'Serve',
            'spike': 'Spike',
            'block': 'Block',
            'dig': 'Dig',
            'set': 'Set',
            'attack': 'Attack'
        };

        const resultLabels = {
            'ace': 'Ace',
            'service-error': 'Service Error',
            'service-point': 'Service Point',
            'service-returned': 'Service Returned',
            'kill': 'Kill',
            'spike-error': 'Spike Error',
            'spike-blocked': 'Spike Blocked',
            'spike-dug': 'Spike Dug',
            'block-kill': 'Block Kill',
            'block-error': 'Block Error',
            'block-touch': 'Block Touch',
            'block-miss': 'Block Miss',
            'dig-success': 'Dig Success',
            'dig-error': 'Dig Error',
            'dig-out': 'Dig Out',
            'set-assist': 'Set Assist',
            'set-error': 'Set Error',
            'set-over': 'Set Over',
            'attack-kill': 'Attack Kill',
            'attack-error': 'Attack Error',
            'attack-blocked': 'Attack Blocked',
            'attack-dug': 'Attack Dug'
        };

        let html = `
            <h2 style="font-size: 22px; margin-bottom: 12px;">Team Statistics</h2>
            
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px;">
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Total Shots</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">${teamStats.total}</div>
                </div>
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Success Rate</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--success-color);">${teamStats.successRate}%</div>
                </div>
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Kills/Aces</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--success-color);">${teamStats.kills}</div>
                </div>
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Errors</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--danger-color);">${teamStats.errors}</div>
                </div>
            </div>
        `;

        // Stats by Set
        const sets = Object.keys(teamStats.bySet).sort((a, b) => parseInt(a) - parseInt(b));
        if (sets.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">By Set</h3>';
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 6px; margin-bottom: 12px;">';
            sets.forEach(set => {
                const setStats = teamStats.bySet[set];
                html += `
                    <div style="padding: 6px; background: var(--bg-color); border-radius: 4px;">
                        <div style="font-weight: 600; font-size: 12px; margin-bottom: 2px;">Set ${set}</div>
                        <div style="font-size: 10px; color: var(--text-secondary); line-height: 1.3;">T:${setStats.total} K:${setStats.kills} E:${setStats.errors}</div>
                        <div style="font-size: 11px; color: var(--success-color); font-weight: 600;">${setStats.successRate}%</div>
                    </div>
                `;
            });
            html += '</div>';
        }

        // Stats by Shot Type
        const shotTypes = Object.keys(teamStats.byShotType).sort();
        if (shotTypes.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">By Shot Type</h3>';
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 6px; margin-bottom: 12px;">';
            shotTypes.forEach(type => {
                const typeStats = teamStats.byShotType[type];
                html += `
                    <div style="padding: 6px; background: var(--bg-color); border-radius: 4px;">
                        <div style="font-weight: 600; font-size: 12px; margin-bottom: 2px;">${shotTypeLabels[type] || type}</div>
                        <div style="font-size: 10px; color: var(--text-secondary); line-height: 1.3;">T:${typeStats.total} K:${typeStats.kills} E:${typeStats.errors}</div>
                        <div style="font-size: 11px; color: var(--success-color); font-weight: 600;">${typeStats.successRate}%</div>
                    </div>
                `;
            });
            html += '</div>';
        }

        // Top Results
        const results = Object.entries(teamStats.byResult)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        if (results.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">Top Results</h3>';
            html += '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; margin-bottom: 12px;">';
            results.forEach(([result, count]) => {
                html += `
                    <div style="display: flex; justify-content: space-between; padding: 6px; background: var(--bg-color); border-radius: 4px; font-size: 11px;">
                        <span>${resultLabels[result] || result}</span>
                        <span style="font-weight: 600;">${count}</span>
                    </div>
                `;
            });
            html += '</div>';
        }

        // Player Statistics Table
        const players = Object.values(teamStats.byPlayer).sort((a, b) => a.number - b.number);
        if (players.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">Player Statistics</h3>';
            html += '<div style="overflow-x: auto;">';
            html += '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
            html += '<thead><tr style="background: var(--bg-color);">';
            html += '<th style="padding: 6px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border-color);">Player</th>';
            html += '<th style="padding: 6px; text-align: center; font-weight: 600; border-bottom: 2px solid var(--border-color);">Shots</th>';
            html += '<th style="padding: 6px; text-align: center; font-weight: 600; border-bottom: 2px solid var(--border-color);">Kills</th>';
            html += '<th style="padding: 6px; text-align: center; font-weight: 600; border-bottom: 2px solid var(--border-color);">Errors</th>';
            html += '<th style="padding: 6px; text-align: center; font-weight: 600; border-bottom: 2px solid var(--border-color);">Success %</th>';
            html += '</tr></thead><tbody>';
            
            players.forEach(player => {
                html += `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 6px;">#${player.number} - ${player.name}</td>
                        <td style="padding: 6px; text-align: center;">${player.total}</td>
                        <td style="padding: 6px; text-align: center; color: var(--success-color);">${player.kills}</td>
                        <td style="padding: 6px; text-align: center; color: var(--danger-color);">${player.errors}</td>
                        <td style="padding: 6px; text-align: center; color: var(--success-color); font-weight: 600;">${player.successRate}%</td>
                    </tr>
                `;
            });
            
            html += '</tbody></table></div>';
        }

        container.innerHTML = html;
    }
}

// Update Manager Class
class UpdateManager {
    constructor() {
        this.registration = null;
        this.updateAvailable = false;
        this.setupUI();
        this.registerServiceWorker();
        this.checkForUpdates();
    }

    setupUI() {
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsModal = document.getElementById('settingsModal');
        const closeSettingsModal = document.getElementById('closeSettingsModal');
        const checkUpdateBtn = document.getElementById('checkUpdateBtn');
        const updateNowBtn = document.getElementById('updateNowBtn');
        const updateLaterBtn = document.getElementById('updateLaterBtn');
        const updateBanner = document.getElementById('updateBanner');

        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                if (settingsModal) {
                    settingsModal.style.display = 'block';
                    this.loadVersion();
                }
            });
        }

        if (closeSettingsModal) {
            closeSettingsModal.addEventListener('click', () => {
                if (settingsModal) {
                    settingsModal.style.display = 'none';
                }
            });
        }

        if (checkUpdateBtn) {
            checkUpdateBtn.addEventListener('click', () => {
                this.checkForUpdates(true);
            });
        }

        if (updateNowBtn) {
            updateNowBtn.addEventListener('click', () => {
                this.applyUpdate();
            });
        }

        if (updateLaterBtn) {
            updateLaterBtn.addEventListener('click', () => {
                if (updateBanner) {
                    updateBanner.classList.add('hidden');
                }
            });
        }

        // Close modal when clicking outside
        if (settingsModal) {
            window.addEventListener('click', (event) => {
                if (event.target === settingsModal) {
                    settingsModal.style.display = 'none';
                }
            });
        }
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                this.registration = await navigator.serviceWorker.register('./service-worker.js');
                console.log('Service Worker registered:', this.registration);

                // Listen for updates
                this.registration.addEventListener('updatefound', () => {
                    const newWorker = this.registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New service worker available
                                this.showUpdateBanner();
                            }
                        });
                    }
                });

                // Check if there's already a waiting service worker
                if (this.registration.waiting) {
                    this.showUpdateBanner();
                }
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    async checkForUpdates(manual = false) {
        const updateStatusText = document.getElementById('updateStatusText');
        const updateBtnText = document.getElementById('updateBtnText');

        if (manual) {
            if (updateBtnText) {
                updateBtnText.textContent = '⏳ Checking...';
            }
            if (updateStatusText) {
                updateStatusText.textContent = '';
            }
        }

        if (this.registration) {
            try {
                await this.registration.update();
                
                // Check if there's a waiting service worker
                if (this.registration.waiting) {
                    this.updateAvailable = true;
                    if (manual) {
                        if (updateStatusText) {
                            updateStatusText.textContent = '✅ Update available! Click "Update Now" in the banner to apply.';
                            updateStatusText.style.color = 'var(--success-color)';
                        }
                        this.showUpdateBanner();
                    }
                    if (updateBtnText) {
                        updateBtnText.textContent = '🔄 Check for Updates';
                    }
                } else {
                    this.updateAvailable = false;
                    if (manual) {
                        if (updateStatusText) {
                            updateStatusText.textContent = '✅ App is up to date!';
                            updateStatusText.style.color = 'var(--success-color)';
                        }
                        if (updateBtnText) {
                            updateBtnText.textContent = '🔄 Check for Updates';
                        }
                    }
                }
            } catch (error) {
                console.error('Update check failed:', error);
                if (manual) {
                    if (updateStatusText) {
                        updateStatusText.textContent = '❌ Failed to check for updates. Please try again.';
                        updateStatusText.style.color = 'var(--danger-color)';
                    }
                    if (updateBtnText) {
                        updateBtnText.textContent = '🔄 Check for Updates';
                    }
                }
            }
        } else {
            if (manual) {
                if (updateStatusText) {
                    updateStatusText.textContent = '⚠️ Service Worker not registered.';
                    updateStatusText.style.color = 'var(--warning-color)';
                }
                if (updateBtnText) {
                    updateBtnText.textContent = '🔄 Check for Updates';
                }
            }
        }
    }

    showUpdateBanner() {
        const updateBanner = document.getElementById('updateBanner');
        if (updateBanner) {
            updateBanner.classList.remove('hidden');
        }
    }

    async applyUpdate() {
        if (this.registration && this.registration.waiting) {
            // Tell the waiting service worker to skip waiting
            this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // Clear all caches
        try {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
        } catch (error) {
            console.error('Error clearing caches:', error);
        }

        // Unregister all service workers
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(reg => reg.unregister()));
        } catch (error) {
            console.error('Error unregistering service workers:', error);
        }

        // Force reload with cache busting
        window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
    }

    async loadVersion() {
        const versionText = document.getElementById('versionText');
        if (!versionText) return;

        try {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                const channel = new MessageChannel();
                navigator.serviceWorker.controller.postMessage(
                    { type: 'GET_VERSION' },
                    [channel.port2]
                );

                channel.port1.onmessage = (event) => {
                    if (event.data && event.data.version) {
                        versionText.textContent = `App Version: ${event.data.version}`;
                    } else {
                        versionText.textContent = 'App Version: Unknown';
                    }
                };

                // Timeout fallback
                setTimeout(() => {
                    if (versionText.textContent === 'App Version: Loading...') {
                        versionText.textContent = 'App Version: Unknown';
                    }
                }, 1000);
            } else {
                // Fallback: try to fetch from service worker file
                try {
                    const response = await fetch('./service-worker.js');
                    const text = await response.text();
                    const match = text.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
                    if (match) {
                        versionText.textContent = `App Version: ${match[1]}`;
                    } else {
                        versionText.textContent = 'App Version: Unknown';
                    }
                } catch (error) {
                    versionText.textContent = 'App Version: Unknown';
                }
            }
        } catch (error) {
            console.error('Error loading version:', error);
            versionText.textContent = 'App Version: Unknown';
        }
    }
}

// Initialize app when DOM is ready
let app;
let updateManager;
document.addEventListener('DOMContentLoaded', () => {
    app = new VolleyballTracker();
    updateManager = new UpdateManager();
});

