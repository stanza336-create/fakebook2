// Mobile-First Messenger Chat Simulation JavaScript

// Data Models
let users = [];
let groups = [];
let currentUser = { id: 'me', name: 'You', avatarDataUrl: null, statusText: 'Active' };
let currentChat = null;
let currentChatType = null; // 'user' or 'group'
let messageIdCounter = 1;
let userIdCounter = 1;
let groupIdCounter = 1;

// Context Menu State
let contextMenuTargetMessage = null;
let replyingToMessage = null;
let isTyping = false;
let arrowClickedWithText = false;
let hiddenFileInput = null;
let hiddenAttachmentInput = null;

// IndexedDB Storage Management
let db = null;
const DB_NAME = 'ChatMessengerDB';
const DB_VERSION = 1;

// Initialize IndexedDB
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            
            // Create object stores
            if (!db.objectStoreNames.contains('users')) {
                const usersStore = db.createObjectStore('users', { keyPath: 'id' });
                usersStore.createIndex('name', 'name', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('groups')) {
                const groupsStore = db.createObjectStore('groups', { keyPath: 'id' });
                groupsStore.createIndex('name', 'name', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
        };
    });
}

// Save data to IndexedDB
async function saveToIndexedDB(storeName, data) {
    if (!db) return;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        if (Array.isArray(data)) {
            // Clear existing data first
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => {
                // Add all items
                data.forEach(item => store.add(item));
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            };
        } else {
            const request = store.put(data);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        }
    });
}

// Load data from IndexedDB
async function loadFromIndexedDB(storeName) {
    if (!db) return [];
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// Save all application data
async function saveAllData() {
    try {
        await Promise.all([
            saveToIndexedDB('users', users),
            saveToIndexedDB('groups', groups),
            saveToIndexedDB('settings', [
                { key: 'messageIdCounter', value: messageIdCounter },
                { key: 'userIdCounter', value: userIdCounter },
                { key: 'groupIdCounter', value: groupIdCounter }
            ])
        ]);
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Load all application data
async function loadAllData() {
    try {
        const [loadedUsers, loadedGroups, loadedSettings] = await Promise.all([
            loadFromIndexedDB('users'),
            loadFromIndexedDB('groups'),
            loadFromIndexedDB('settings')
        ]);
        
        // Only load data if it exists, otherwise keep sample data
        if (loadedUsers.length > 0) {
            users = loadedUsers;
            // Ensure fixed profile order after loading from IndexedDB
            ensureFixedProfileOrder();
        }
        
        if (loadedGroups.length > 0) {
            groups = loadedGroups;
        }
        
        // Restore counters
        loadedSettings.forEach(setting => {
            if (setting.key === 'messageIdCounter') messageIdCounter = setting.value;
            if (setting.key === 'userIdCounter') userIdCounter = setting.value;
            if (setting.key === 'groupIdCounter') groupIdCounter = setting.value;
        });
        
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Ensure fixed profiles (Developer > জাতির ভাবি > Mimi) stay at top in correct order
function ensureFixedProfileOrder() {
    // Separate special profiles from regular users
    const developer = users.find(u => u.isDeveloper);
    const specialProfile = users.find(u => u.isSpecialProfile);
    const mimi = users.find(u => u.isChatProfile);
    const regularUsers = users.filter(u => !u.isDeveloper && !u.isSpecialProfile && !u.isChatProfile);
    
    // Rebuild array with fixed order: Developer > জাতির ভাবি > Mimi > Others
    users = [];
    if (developer) users.push(developer);
    if (specialProfile) users.push(specialProfile);
    if (mimi) users.push(mimi);
    users.push(...regularUsers);
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Initialize database first
        await initializeDatabase();
        
        // Load existing data from IndexedDB
        await loadAllData();
        
        initializeEventListeners();
        
        // Initialize dark mode
        initializeDarkMode();
        
        // Add cancel reply event listener
        document.getElementById('cancelReply').addEventListener('click', cancelReply);
        
        // Load sample data only if no users exist (first time)
        if (users.length === 0) {
            loadSampleData();
            // Save the initial data
            await saveAllData();
        }
        
        renderContacts();
        showView('contactsView');
        
    } catch (error) {
        console.error('Error initializing application:', error);
        // Fallback to sample data if database fails
        initializeEventListeners();
        initializeDarkMode();
        document.getElementById('cancelReply').addEventListener('click', cancelReply);
        loadSampleData();
        renderContacts();
        showView('contactsView');
    }
});

// Event Listeners
function initializeEventListeners() {
    // Mobile navigation
    document.getElementById('addUserBtnMobile').addEventListener('click', () => showView('addUserView'));
    document.getElementById('addGroupBtnMobile').addEventListener('click', () => {
        populateMembersListMobile();
        showView('addGroupView');
    });
    document.getElementById('backBtn').addEventListener('click', () => showView('contactsView'));
    document.getElementById('rulesBtn').addEventListener('click', showRulesModal);
    
    // Message input handling
    const messageInput = document.getElementById('messageInput');
    messageInput.addEventListener('input', function() {
        handleTyping();
        autoResizeTextarea(this);
    });
    // Disable Enter-to-send: Enter creates a newline; send via button only
    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            // Allow newline, do not send
            // No preventDefault so a newline is inserted
        }
    });
    
    document.getElementById('sendBtn').addEventListener('click', handleSendMessage);
    
    // Add like button functionality - always show action options (Send as / Receive from)
    document.getElementById('likeBtn').addEventListener('click', function() {
        if (!currentChat || isTyping) return; // Prevent like when typing
        // Show action options for like, including Mimi
        showActionOptions('👍');
    });
    
    // Add toggle actions button functionality
    document.getElementById('toggleActionsBtn').addEventListener('click', toggleActions);
    
    // Create hidden file input for photo uploads
    const photoInput = document.createElement('input');
    photoInput.type = 'file';
    photoInput.accept = 'image/*';
    photoInput.style.display = 'none';
    document.body.appendChild(photoInput);
    hiddenFileInput = photoInput;
    
    // Hidden file input for generic attachments
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    hiddenAttachmentInput = fileInput;
    
    // Add action button event listeners
    document.getElementById('addBtn').addEventListener('click', function() {
        // Check if we have an active chat before allowing photo upload
        if (!currentChat) return;
        // Trigger photo upload
        photoInput.click();
    });
    
    // Handle photo selection
    photoInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const imageDataUrl = e.target.result;
                // Show action options for sending the image
                showActionOptionsForImage(imageDataUrl, file.name);
            };
            reader.readAsDataURL(file);
        }
        // Reset input so same file can be selected again
        e.target.value = '';
    });

    // Attach file button removed per request
    
    // Handle generic file selection
    hiddenAttachmentInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) { e.target.value = ''; return; }
        // Images go through the image flow
        if (file.type && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(ev) {
                showActionOptionsForImage(ev.target.result, file.name);
            };
            reader.readAsDataURL(file);
        } else {
            // Non-image: create attachment message
            const reader = new FileReader();
            reader.onload = function(ev) {
                const dataUrl = ev.target.result; // for download
                showActionOptionsForAttachment({ name: file.name, size: file.size, dataUrl });
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    });

    // Voice message simulation
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', function() {
            if (!currentChat) return;
            showVoiceSendOptions();
        });
    }
    
    document.getElementById('gifBtn').addEventListener('click', function() {
        // Handle GIF button functionality
        console.log('GIF button clicked');
    });
    
    
    // Add emoji button event listener
    document.getElementById('emojiBtn').addEventListener('click', function() {
        showEmojiPicker();
    });
    
    // DEFENSIVE: Force remove any sticker elements (anti-cache protection)
    document.querySelectorAll('[title="Sticker"], #stickerBtn, .sticker-btn').forEach(el => el.remove());
    console.log('FORCED STICKER REMOVAL: Any cached sticker icons eliminated');
    
    // Avatar preview handlers
    document.getElementById('userAvatarMobile').addEventListener('change', function(e) {
        previewAvatar(e, 'userAvatarPreviewMobile');
    });
    
    document.getElementById('groupAvatarMobile').addEventListener('change', function(e) {
        previewAvatar(e, 'groupAvatarPreviewMobile');
    });
    
    // Click outside handlers
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.context-menu') && !e.target.closest('.message-bubble')) {
            hideContextMenu();
        }
        if (!e.target.closest('.emoji-picker') && !e.target.closest('.context-menu-item')) {
            hideEmojiPicker();
        }
        if (!e.target.closest('.action-options-modal') && !e.target.closest('#sendBtn') && !e.target.closest('#messageInput')) {
            hideActionOptions();
        }
        if (!e.target.closest('.rules-modal-content') && !e.target.closest('#rulesBtn')) {
            hideRulesModal();
        }
    });
    
    // Status text editing
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('status') && currentChatType === 'user') {
            editStatusText();
        }
    });
    
    // Long press for reactions
}

// Mobile Navigation
function showView(viewId) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active-view');
    });
    
    // Show target view
    document.getElementById(viewId).classList.add('active-view');
}

// Load sample data for demonstration
function loadSampleData() {
    // Add DK Shuvo developer profile - always stays at top
    users = [
        {
            id: 'developer',
            name: 'DK Shuvo',
            avatarDataUrl: 'A.jpg',
            statusText: 'Developer',
            lastActive: new Date(),
            isOnline: true,
            isDeveloper: true, // Special flag for developer profile
            messages: [],
            contactInfo: {
                description: 'আমি হলাম এই অ্যাপসের একমাত্র পিচ্চি টাইপের ডেভেলপার 🙃\n\nযদি এই অ্যাপস ব্যবহার করার সময় কোন প্রকার অসুবিধা ফেস করো, অথবা কোন কিছু এড করতে চাও তাহলে আমার সাথে যোগাযোগ করিও!',
                developerInfo: {
                    facebook: 'https://www.facebook.com/dk.shuvo.731437',
                    whatsapp: '+8801978447942',
                    email: 'jkshuvo1978@gmail.com'
                },
                endMessage: 'প্রথম প্রোফাইলে ঢুকে পড়ো চান্দু, গুরুত্বপূর্ণ কথা আছে! 🤫'
            }
        },
        {
            id: 'special_profile',
            name: 'দুঁষ্টুঁ রাঁজাঁরঁ মিঁষ্টিঁ রাঁনীঁ',
            avatarDataUrl: 'pp.jpg',
            statusText: 'জাতির ভাবি',
            lastActive: new Date(),
            isOnline: true,
            isSpecialProfile: true, // Special flag for this unique profile
            messages: [],
            contactInfo: {
                description: '✨ ইনি হলেন আমাদের জাতির ভাবি, নাম হল অনন্যা, ফ্রেন্ডরা অনু বলে ডাকে! 👑\n\n🤔 এখন আপনারা প্রশ্ন করতে পারেন এখানে তার ডিটেলস কেন?\n\n😅 কিন্তু ভাই যদি তার ডিটেলস না দেই তাহলে অ্যাপস এর খবর তো জানিনা আবার ডেভলপার হাসপাতালে যাবে এটা শিওর! 🏥',
                keyboardImage: 'k.jpg',
                keyboardCaption: '⌨️ এটা হলো ওনার সেই ফেমাস কিবোর্ড যেটা ভিডিওর মধ্যে না থাকলে সেটা গ্রহণযোগ্যই হবে না! 🎥✨ যাইহোক এর বিষয়ে বেশি কিছু বকবক করলে চলবে না নাইলে ইনবক্সে থাপড়াইবে!',
                endMessage: '😂 এখন আজাইরা কাউ কাউ বাদ দিয়ে শুরু করো নিজের কাজ, আর যদি খাইয়া কাজ না থাকে তাহলে মিমি আছে তিন নাম্বার প্রোফাইলে কথা বলতে পারো তার সাথে। 💬\n\n⏰ চাইলে গ্রুপে ওয়েট করতে পারবে, বাট আমার মনে হয় না করাটাই ভালো খামুখা বিরক্ত করবে! 😤\n\n📱 **নোট:** এই অ্যাপস কিভাবে ব্যবহার করতে হয় এটা না জানলে একটু ব্যাক দাও, নিয়মাবলির একটা বাটন আছে ওইটাতে ক্লিক করো - সব বুঝতে পারবে। খামাখা ইনবক্সে কাপঝাপ করবা না! 🏃‍♂️ যা দৌড় দে।'
            }
        },
        {
            id: 'mimi',
            name: 'Mimi',
            avatarDataUrl: 'M.jpg',
            statusText: 'অনলাইন চ্যাটিং',
            lastActive: new Date(),
            isOnline: true,
            isChatProfile: true, // Special flag for chatting profile
            messages: []
        }
    ];
    
    // Remove all demo groups
    groups = [];
}

// Avatar preview functionality
function previewAvatar(event, previewId) {
    const file = event.target.files[0];
    const preview = document.getElementById(previewId);
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        preview.style.display = 'none';
    }
}

// User Management (Mobile)
function addUserMobile() {
    const name = document.getElementById('userNameMobile').value.trim();
    const statusText = document.getElementById('userStatusMobile').value.trim() || 'Active';
    const avatarFile = document.getElementById('userAvatarMobile').files[0];
    
    if (!name) {
        alert('Please enter a user name');
        return;
    }
    
    const user = {
        id: 'user_' + userIdCounter++,
        name: name,
        statusText: statusText,
        avatarDataUrl: null,
        isOnline: true, // Always online
        lastActive: new Date(Date.now() - Math.floor(Math.random() * 3600000)), // Random time within last hour
        messages: []
    };
    
    if (avatarFile) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            user.avatarDataUrl = e.target.result;
            insertUserAfterSpecialProfiles(user);
            await saveAllData(); // Save to IndexedDB
            renderContacts();
            clearUserForm();
            showView('contactsView');
        };
        reader.readAsDataURL(avatarFile);
    } else {
        insertUserAfterSpecialProfiles(user);
        saveAllData(); // Save to IndexedDB
        renderContacts();
        clearUserForm();
        showView('contactsView');
    }
}

// Function to insert user after special profiles but before regular users
function insertUserAfterSpecialProfiles(user) {
    // Find the index where special profiles end (after developer, special_profile, and mimi)
    let insertIndex = 0;
    
    // Count special profiles at the beginning
    for (let i = 0; i < users.length; i++) {
        const userProfile = users[i];
        if (userProfile.isDeveloper || userProfile.isSpecialProfile || userProfile.isChatProfile) {
            insertIndex = i + 1; // Insert after this special profile
        } else {
            break; // Stop when we reach first non-special profile
        }
    }
    
    // Insert the new user at the calculated position
    users.splice(insertIndex, 0, user);
}

function clearUserForm() {
    document.getElementById('userNameMobile').value = '';
    document.getElementById('userStatusMobile').value = '';
    document.getElementById('userAvatarMobile').value = '';
    document.getElementById('userAvatarPreviewMobile').style.display = 'none';
}

function populateMembersListMobile() {
    const membersList = document.getElementById('membersListMobile');
    membersList.innerHTML = '';
    
    users.forEach(user => {
        const memberDiv = document.createElement('div');
        memberDiv.className = 'member-checkbox';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `member_mobile_${user.id}`;
        checkbox.value = user.id;
        
        const img = document.createElement('img');
        img.src = user.avatarDataUrl || generateDefaultAvatar(user.name);
        img.alt = user.name;
        img.onerror = function() { this.style.display = 'none'; };
        
        const label = document.createElement('label');
        label.htmlFor = `member_mobile_${user.id}`;
        label.textContent = user.name;
        
        memberDiv.appendChild(checkbox);
        memberDiv.appendChild(img);
        memberDiv.appendChild(label);
        
        membersList.appendChild(memberDiv);
    });
}

function addGroupMobile() {
    const name = document.getElementById('groupNameMobile').value.trim();
    const avatarFile = document.getElementById('groupAvatarMobile').files[0];
    const selectedMembers = [];
    
    const checkboxes = document.querySelectorAll('#membersListMobile input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
        selectedMembers.push(cb.value);
    });
    
    if (!name) {
        alert('Please enter a group name');
        return;
    }
    
    if (selectedMembers.length === 0) {
        alert('Please select at least one member');
        return;
    }
    
    const group = {
        id: 'group_' + groupIdCounter++,
        name: name,
        avatarDataUrl: null,
        members: selectedMembers,
        messages: []
    };
    
    if (avatarFile) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            group.avatarDataUrl = e.target.result;
            groups.push(group);
            await saveAllData(); // Save to IndexedDB
            renderContacts();
            clearGroupForm();
            showView('contactsView');
        };
        reader.readAsDataURL(avatarFile);
    } else {
        groups.push(group);
        saveAllData(); // Save to IndexedDB
        renderContacts();
        clearGroupForm();
        showView('contactsView');
    }
}

function clearGroupForm() {
    document.getElementById('groupNameMobile').value = '';
    document.getElementById('groupAvatarMobile').value = '';
    document.getElementById('groupAvatarPreviewMobile').style.display = 'none';
    const checkboxes = document.querySelectorAll('#membersListMobile input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
}

// Generate default avatar with initials
function generateDefaultAvatar(name) {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    
    // Background color based on name
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
    const colorIndex = name.length % colors.length;
    ctx.fillStyle = colors[colorIndex];
    ctx.fillRect(0, 0, 80, 80);
    
    // Text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, 40, 40);
    
    return canvas.toDataURL();
}

// Render contacts in sidebar
function renderContacts() {
    const usersList = document.getElementById('usersList');
    const groupsList = document.getElementById('groupsList');
    
    // Render users
    usersList.innerHTML = '';
    users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'contact-item';
        userElement.dataset.id = user.id;
        userElement.dataset.type = 'user';
        
        const avatar = document.createElement('div');
        avatar.className = 'contact-avatar contact-avatar-container';
        
        const avatarImg = document.createElement('img');
        avatarImg.src = user.avatarDataUrl || generateDefaultAvatar(user.name);
        avatarImg.alt = user.name;
        avatarImg.style.width = '100%';
        avatarImg.style.height = '100%';
        avatarImg.style.borderRadius = '50%';
        avatarImg.style.objectFit = 'cover';
        avatarImg.onerror = function() { 
            avatar.textContent = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        };
        
        avatar.appendChild(avatarImg);
        
        // Add active indicator (green dot)
        if (user.isOnline) {
            const indicator = document.createElement('div');
            indicator.className = 'active-indicator';
            avatar.appendChild(indicator);
        }
        
        const contactInfo = document.createElement('div');
        contactInfo.className = 'contact-info';
        
        const contactName = document.createElement('div');
        contactName.className = 'contact-name';
        contactName.textContent = user.name;
        
        const contactStatus = document.createElement('div');
        contactStatus.className = 'contact-status';
        contactStatus.textContent = user.statusText;
        
        contactInfo.appendChild(contactName);
        contactInfo.appendChild(contactStatus);
        
        userElement.appendChild(avatar);
        userElement.appendChild(contactInfo);
        
        // Add three-dot menu for non-special profiles
        if (!user.isDeveloper && !user.isSpecialProfile && !user.isChatProfile) {
            const menuButton = document.createElement('div');
            menuButton.className = 'contact-menu-button';
            menuButton.innerHTML = '⋮';
            menuButton.title = 'Options';
            
            menuButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent opening chat
                showContactMenu(user.id, 'user', e.target);
            });
            
            userElement.appendChild(menuButton);
        }
        
        userElement.addEventListener('click', () => openChat(user, 'user'));
        usersList.appendChild(userElement);
    });
    
    // Render groups
    groupsList.innerHTML = '';
    groups.forEach(group => {
        const groupElement = document.createElement('div');
        groupElement.className = 'contact-item';
        groupElement.dataset.id = group.id;
        groupElement.dataset.type = 'group';
        
        const avatar = document.createElement('div');
        avatar.className = 'contact-avatar';
        
        const avatarImg = document.createElement('img');
        avatarImg.src = group.avatarDataUrl || generateDefaultAvatar(group.name);
        avatarImg.alt = group.name;
        avatarImg.style.width = '100%';
        avatarImg.style.height = '100%';
        avatarImg.style.borderRadius = '50%';
        avatarImg.style.objectFit = 'cover';
        avatarImg.onerror = function() { 
            avatar.textContent = group.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        };
        
        avatar.appendChild(avatarImg);
        
        const contactInfo = document.createElement('div');
        contactInfo.className = 'contact-info';
        
        const contactName = document.createElement('div');
        contactName.className = 'contact-name';
        contactName.textContent = group.name;
        
        contactInfo.appendChild(contactName);
        
        groupElement.appendChild(avatar);
        groupElement.appendChild(contactInfo);
        
        // Add three-dot menu for all groups (all groups are deletable)
        const menuButton = document.createElement('div');
        menuButton.className = 'contact-menu-button';
        menuButton.innerHTML = '⋮';
        menuButton.title = 'Options';
        
        menuButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent opening chat
            showContactMenu(group.id, 'group', e.target);
        });
        
        groupElement.appendChild(menuButton);
        
        groupElement.addEventListener('click', () => openChat(group, 'group'));
        groupsList.appendChild(groupElement);
    });
}

// Contact Menu Functions
function showContactMenu(contactId, contactType, buttonElement) {
    // Remove any existing menu
    hideContactMenu();
    
    const menu = document.createElement('div');
    menu.className = 'contact-menu';
    menu.id = 'contactMenu';
    
    // Delete option
    const deleteOption = document.createElement('div');
    deleteOption.className = 'contact-menu-item delete-option';
    deleteOption.innerHTML = '🗑️ Delete';
    deleteOption.addEventListener('click', () => {
        hideContactMenu();
        confirmDeleteContact(contactId, contactType);
    });
    
    menu.appendChild(deleteOption);
    
    // Position the menu relative to the button
    const buttonRect = buttonElement.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = (buttonRect.bottom + 5) + 'px';
    menu.style.left = (buttonRect.left - 80) + 'px'; // Offset to the left
    menu.style.zIndex = '1000';
    
    document.body.appendChild(menu);
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', closeMenuOnClickOutside);
    }, 10);
}

function hideContactMenu() {
    const menu = document.getElementById('contactMenu');
    if (menu) {
        menu.remove();
    }
    document.removeEventListener('click', closeMenuOnClickOutside);
}

function closeMenuOnClickOutside(event) {
    const menu = document.getElementById('contactMenu');
    if (menu && !menu.contains(event.target)) {
        hideContactMenu();
    }
}

function confirmDeleteContact(contactId, contactType) {
    const contactName = getContactName(contactId, contactType);
    const message = contactType === 'user' 
        ? `Are you sure you want to delete ${contactName}? This action cannot be undone.`
        : `Are you sure you want to delete the group "${contactName}"? This action cannot be undone.`;
    
    if (confirm(message)) {
        deleteContact(contactId, contactType);
    }
}

function getContactName(contactId, contactType) {
    if (contactType === 'user') {
        const user = users.find(u => u.id === contactId);
        return user ? user.name : 'Unknown User';
    } else {
        const group = groups.find(g => g.id === contactId);
        return group ? group.name : 'Unknown Group';
    }
}

function deleteContact(contactId, contactType) {
    if (contactType === 'user') {
        // Remove user from users array
        const userIndex = users.findIndex(u => u.id === contactId);
        if (userIndex !== -1) {
            users.splice(userIndex, 1);
        }
        
        // Remove user from all groups
        groups.forEach(group => {
            if (group.members && group.members.includes(contactId)) {
                group.members = group.members.filter(memberId => memberId !== contactId);
            }
        });
    } else {
        // Remove group from groups array
        const groupIndex = groups.findIndex(g => g.id === contactId);
        if (groupIndex !== -1) {
            groups.splice(groupIndex, 1);
        }
    }
    
    // If currently viewing the deleted contact, go back to contacts view
    if (currentChat && currentChat.id === contactId) {
        showView('contactsView');
        currentChat = null;
        currentChatType = null;
    }
    
    // Save changes and re-render contacts
    saveAllData(); // Save to IndexedDB
    renderContacts();
}

// Chat Functions
function openChat(chatData, type) {
    currentChat = chatData;
    currentChatType = type;
    
    // Update active state
    document.querySelectorAll('.contact-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`.contact-item[data-id="${chatData.id}"]`).classList.add('active');
    
    // Show chat view
    showView('chatView');
    
    // Update chat header
    const chatAvatar = document.getElementById('chatAvatar');
    const chatName = document.getElementById('chatName');
    const chatStatus = document.getElementById('chatStatus');
    
    const avatarSrc = chatData.avatarDataUrl || generateDefaultAvatar(chatData.name);
    chatAvatar.src = avatarSrc;
    chatName.textContent = chatData.name;
    
    // Add active indicator to chat avatar if user is online
    const existingIndicator = chatAvatar.parentElement.querySelector('.active-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    if (chatData.isOnline) {
        // Wrap avatar in container if not already wrapped
        if (!chatAvatar.parentElement.classList.contains('chat-avatar-container')) {
            const container = document.createElement('div');
            container.className = 'chat-avatar-container';
            chatAvatar.parentElement.insertBefore(container, chatAvatar);
            container.appendChild(chatAvatar);
        }
        
        const indicator = document.createElement('div');
        indicator.className = 'active-indicator';
        chatAvatar.parentElement.appendChild(indicator);
    }
    
    // Handle developer profile differently
    if (chatData.isDeveloper) {
        chatStatus.textContent = 'Developer';
        chatStatus.className = 'status';
        chatStatus.style.cursor = 'default';
        chatStatus.onclick = null;
        
        // Hide message input container for developer profile
        const messageInputContainer = document.querySelector('.message-input-container');
        if (messageInputContainer) {
            messageInputContainer.style.display = 'none';
        }
        
        
        // Render developer info
        renderDeveloperInfo();
        return;
    }
    
    // Handle special profile differently
    if (chatData.isSpecialProfile) {
        chatStatus.textContent = 'জাতির ভাবি';
        chatStatus.className = 'status';
        chatStatus.style.cursor = 'default';
        chatStatus.onclick = null;
        
        // Hide message input container for special profile
        const messageInputContainer = document.querySelector('.message-input-container');
        if (messageInputContainer) {
            messageInputContainer.style.display = 'none';
        }
        
        // Render special profile info
        renderSpecialProfileInfo();
        return;
    } else {
        // Show message input container for regular chats
        const messageInputContainer = document.querySelector('.message-input-container');
        if (messageInputContainer) {
            messageInputContainer.style.display = 'flex';
        }
    }
    
    if (type === 'user') {
        // Always show as Active by default, but allow users to click and change
        chatStatus.textContent = chatData.customStatus || 'Active';
        chatStatus.className = 'status';
        
        // Make status clickable to change
        chatStatus.style.cursor = 'pointer';
        chatStatus.onclick = function() {
            const options = ['Active', '5 minutes ago', '10 minutes ago', '15 minutes ago', '30 minutes ago', '1 hour ago'];
            const currentIndex = options.indexOf(chatStatus.textContent);
            const nextIndex = (currentIndex + 1) % options.length;
            chatStatus.textContent = options[nextIndex];
            // Store the custom status
            chatData.customStatus = options[nextIndex];
        };
    } else {
        // Group chat: do not show member names or counts under the group name
        chatStatus.textContent = '';
        chatStatus.className = 'status';
    }
    
    // Mark all messages as seen when opening chat
    markAllMessagesAsSeenByCurrentUser();
    
    // Render messages
    renderMessages();
    
    // Initialize textarea height
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        autoResizeTextarea(messageInput);
    }
}

function renderMessages() {
    const messagesList = document.getElementById('messagesList');
    messagesList.innerHTML = '';
    
    if (!currentChat) return;
    
    // Add contact info section if it exists (hhh.html style)
    if (currentChatType === 'user' && currentChat.contactInfo) {
        const contactInfoElement = createContactInfoElement(currentChat);
        messagesList.appendChild(contactInfoElement);
    }
    
    if (!currentChat.messages) return;
    
    currentChat.messages.forEach((message, index) => {
        // Determine if we should show avatar for this received message: only for the last
        // message in a consecutive sequence from the same sender
        let showAvatarForReceived = true;
        const nextMessage = currentChat.messages[index + 1];
        if (nextMessage && nextMessage.senderId === message.senderId) {
            showAvatarForReceived = false;
        }
        const messageElement = createMessageElement(message, showAvatarForReceived);
        messagesList.appendChild(messageElement);
    });
    
    // Auto scroll to bottom
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Render developer info for developer profile
function renderDeveloperInfo() {
    const messagesList = document.getElementById('messagesList');
    messagesList.innerHTML = '';
    
    if (!currentChat || !currentChat.isDeveloper || !currentChat.contactInfo) return;
    
    const developerInfoDiv = document.createElement('div');
    developerInfoDiv.className = 'developer-info-section';
    
    const avatarSrc = currentChat.avatarDataUrl || generateDefaultAvatar(currentChat.name);
    
    developerInfoDiv.innerHTML = `
        <div class="developer-info-container">
            <div class="developer-info-avatar-container">
                <img src="${avatarSrc}" alt="Developer Profile" class="developer-info-avatar">
                ${currentChat.isOnline ? '<div class="developer-info-active-dot"></div>' : ''}
            </div>
            <div class="developer-info-name">${currentChat.name}</div>
            <div class="developer-info-description">
                ${currentChat.contactInfo.description}
            </div>
            <div class="developer-contact-info">
                <div class="contact-item">
                    <strong>Facebook:</strong> 
                    <a href="${currentChat.contactInfo.developerInfo.facebook}" target="_blank" rel="noopener noreferrer">
                        ${currentChat.contactInfo.developerInfo.facebook}
                    </a>
                </div>
                <div class="contact-item">
                    <strong>WhatsApp:</strong> 
                    <a href="https://wa.me/${currentChat.contactInfo.developerInfo.whatsapp.replace('+', '')}" target="_blank" rel="noopener noreferrer">
                        ${currentChat.contactInfo.developerInfo.whatsapp}
                    </a>
                </div>
                <div class="contact-item">
                    <strong>Email:</strong> 
                    <a href="mailto:${currentChat.contactInfo.developerInfo.email}">
                        ${currentChat.contactInfo.developerInfo.email}
                    </a>
                </div>
            </div>
            <div class="developer-end-message">
                ${currentChat.contactInfo.endMessage}
            </div>
        </div>
    `;
    
    messagesList.appendChild(developerInfoDiv);
    
    // Auto scroll to top for developer info
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.scrollTop = 0;
}

// Render special profile info for special profile
function renderSpecialProfileInfo() {
    const messagesList = document.getElementById('messagesList');
    messagesList.innerHTML = '';
    
    if (!currentChat || !currentChat.isSpecialProfile || !currentChat.contactInfo) return;
    
    const specialProfileDiv = document.createElement('div');
    specialProfileDiv.className = 'special-profile-section';
    
    const avatarSrc = currentChat.avatarDataUrl || generateDefaultAvatar(currentChat.name);
    
    specialProfileDiv.innerHTML = `
        <div class="special-profile-container">
            <div class="special-profile-avatar-container">
                <img src="${avatarSrc}" alt="Special Profile" class="special-profile-avatar">
                ${currentChat.isOnline ? '<div class="special-profile-active-dot"></div>' : ''}
            </div>
            <div class="special-profile-name">${currentChat.name}</div>
            <div class="special-profile-description">
                ${currentChat.contactInfo.description}
            </div>
            <div class="special-profile-keyboard-section">
                <img src="${currentChat.contactInfo.keyboardImage}" alt="Keyboard" class="special-profile-keyboard-image">
                <div class="special-profile-keyboard-caption">
                    ${currentChat.contactInfo.keyboardCaption}
                </div>
            </div>
            <div class="special-profile-end-message">
                ${currentChat.contactInfo.endMessage}
            </div>
        </div>
    `;
    
    messagesList.appendChild(specialProfileDiv);
    
    // Auto scroll to top for special profile info
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.scrollTop = 0;
}

// Create contact info element (hhh.html style)
function createContactInfoElement(chat) {
    const contactInfoDiv = document.createElement('div');
    contactInfoDiv.className = 'contact-info-section';
    
    const avatarSrc = chat.avatarDataUrl || generateDefaultAvatar(chat.name);
    
    contactInfoDiv.innerHTML = `
        <div class="contact-info-container">
            <div class="contact-info-avatar-container">
                <img src="${avatarSrc}" alt="Profile pic" class="contact-info-avatar">
                ${chat.isOnline ? '<div class="contact-info-active-dot"></div>' : ''}
            </div>
            <div class="contact-info-details">
                <div class="contact-info-name">${chat.name}</div>
                <div class="contact-info-description">
                    ${chat.contactInfo.description}
                </div>
                <div class="contact-info-connection">
                    ${chat.contactInfo.connectionDate}<br>
                    ${chat.contactInfo.connectionText}
                </div>
            </div>
        </div>
    `;
    
    return contactInfoDiv;
}

function createMessageElement(message, showAvatarForReceived = true) {
    const messageDiv = document.createElement('div');
    const isFromMe = message.senderId === currentUser.id;
    messageDiv.className = `message ${isFromMe ? 'sent' : 'received'}`;
    messageDiv.dataset.messageId = message.id;
    
    // Create message content wrapper
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    // Add reply information if this message is a reply
    if (message.replyTo) {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'message-reply';
        
        // Get the name of who we're replying to
        let replySenderName;
        if (message.replyTo.senderId === currentUser.id) {
            replySenderName = 'You';
        } else if (currentChatType === 'group') {
            const replySender = users.find(u => u.id === message.replyTo.senderId);
            replySenderName = replySender ? replySender.name : 'Unknown';
        } else {
            replySenderName = currentChat.name;
        }
        
        const replySender = document.createElement('div');
        replySender.className = 'reply-sender';
        replySender.textContent = replySenderName;
        
        const replyText = document.createElement('div');
        replyText.className = 'reply-text';
        replyText.textContent = message.replyTo.text;
        
        replyDiv.appendChild(replySender);
        replyDiv.appendChild(replyText);
        messageContent.appendChild(replyDiv);
    }
    
    // Add sender name for group messages (only for received messages)
    if (currentChatType === 'group' && !isFromMe) {
        const sender = users.find(u => u.id === message.senderId);
        if (sender) {
            const senderNameDiv = document.createElement('div');
            senderNameDiv.style.fontSize = '12px';
            senderNameDiv.style.color = '#65676b';
            senderNameDiv.style.marginBottom = '4px';
            senderNameDiv.textContent = sender.name;
            messageContent.appendChild(senderNameDiv);
        }
    }
    
    // If received message, add avatar or spacer on the left
    if (!isFromMe) {
        if (showAvatarForReceived) {
            const messageAvatarContainer = document.createElement('div');
            messageAvatarContainer.className = 'message-avatar-container';
            messageAvatarContainer.style.marginRight = '8px';
            messageAvatarContainer.style.alignSelf = 'flex-end';
            const messageAvatar = document.createElement('img');
            messageAvatar.className = 'message-avatar';
            messageAvatar.style.width = '28px';
            messageAvatar.style.height = '28px';
            messageAvatar.style.borderRadius = '50%';
            messageAvatar.style.objectFit = 'cover';
            let sender;
            if (currentChatType === 'group') {
                sender = users.find(u => u.id === message.senderId);
            } else {
                sender = currentChat;
            }
            if (sender) {
                messageAvatar.src = sender.avatarDataUrl || generateDefaultAvatar(sender.name);
                messageAvatar.alt = sender.name;
                messageAvatar.onerror = function() { this.style.display = 'none'; };
                messageAvatarContainer.appendChild(messageAvatar);
                if (sender.isOnline) {
                    const indicator = document.createElement('div');
                    indicator.className = 'active-indicator';
                    messageAvatarContainer.appendChild(indicator);
                }
            }
            messageDiv.appendChild(messageAvatarContainer);
        } else {
            const spacer = document.createElement('div');
            spacer.className = 'message-avatar-spacer';
            spacer.style.width = '28px';
            spacer.style.height = '28px';
            spacer.style.marginRight = '8px';
            spacer.style.flexShrink = '0';
            messageDiv.appendChild(spacer);
        }
    }

    // Create message bubble
    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    // Add long press and right click for context menu
    let longPressTimer;
    
    messageBubble.addEventListener('mousedown', (event) => {
        longPressTimer = setTimeout(() => {
            // Show quick reaction picker instead of context menu for easier access
            showQuickReactionPicker(event, message.id);
        }, 500);
        event.stopPropagation();
    });
    
    messageBubble.addEventListener('mouseup', () => {
        clearTimeout(longPressTimer);
    });
    
    messageBubble.addEventListener('mouseleave', () => {
        clearTimeout(longPressTimer);
    });
    
    // Touch events for mobile
    messageBubble.addEventListener('touchstart', (event) => {
        longPressTimer = setTimeout(() => {
            // Show quick reaction picker for easier mobile interaction
            showQuickReactionPicker(event, message.id);
        }, 500);
        event.stopPropagation();
    });
    
    messageBubble.addEventListener('touchend', (event) => {
        clearTimeout(longPressTimer);
        event.preventDefault();
    });
    
    // Right click context menu
    messageBubble.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        showMessageContextMenu(event, message.id);
    });
    
    // Double click/tap for context menu (easier access)
    let clickCount = 0;
    messageBubble.addEventListener('click', (event) => {
        event.stopPropagation();
        clickCount++;
        
        if (clickCount === 1) {
            setTimeout(() => {
                if (clickCount === 2) {
                    // Double click detected - show context menu
                    showMessageContextMenu(event, message.id);
                }
                clickCount = 0;
            }, 300);
        }
    });
    
    // Check if this is an image-only message
    const isImageOnlyMessage = message.imageDataUrl && (!message.text || message.text === message.imageName || message.text === 'Photo');
    
    if (isImageOnlyMessage) {
        // For image-only messages, make bubble transparent and remove padding
        messageBubble.style.background = 'transparent';
        messageBubble.style.padding = '0';
        messageBubble.style.boxShadow = 'none';
        messageBubble.className = 'message-bubble image-only-bubble';
        // Add class to main message div for spacing control
        messageDiv.classList.add('image-only-message');
        
        // Display image
        const messageImage = document.createElement('img');
        messageImage.className = 'message-image-only';
        messageImage.src = message.imageDataUrl;
        messageImage.alt = message.imageName || 'Shared image';
        messageImage.style.maxWidth = '250px';
        messageImage.style.maxHeight = '200px';
        messageImage.style.borderRadius = '12px';
        messageImage.style.cursor = 'pointer';
        messageImage.style.display = 'block';
        
        // Add click to view full size
        messageImage.addEventListener('click', function(event) {
            event.stopPropagation(); // Prevent bubble click handlers
            showImagePreview(message.imageDataUrl);
        });
        
        // Prevent context menu on image from triggering bubble context menu
        messageImage.addEventListener('contextmenu', function(event) {
            event.stopPropagation();
        });
        
        messageBubble.appendChild(messageImage);
    } else {
        // Regular text message or image with text
        if (message.imageDataUrl) {
            // Display image
            const messageImage = document.createElement('img');
            messageImage.className = 'message-image';
            messageImage.src = message.imageDataUrl;
            messageImage.alt = message.imageName || 'Shared image';
            messageImage.style.maxWidth = '250px';
            messageImage.style.maxHeight = '200px';
            messageImage.style.borderRadius = '12px';
            messageImage.style.cursor = 'pointer';
            messageImage.style.display = 'block';
            
            // Add click to view full size
            messageImage.addEventListener('click', function(event) {
                event.stopPropagation(); // Prevent bubble click handlers
                showImagePreview(message.imageDataUrl);
            });
            
            // Prevent context menu on image from triggering bubble context menu
            messageImage.addEventListener('contextmenu', function(event) {
                event.stopPropagation();
            });
            
            messageBubble.appendChild(messageImage);
        }
        
        // Attachment pill
        if (message.attachment) {
            const link = document.createElement('a');
            link.className = 'attachment-pill';
            link.href = message.attachment.dataUrl || '#';
            link.download = message.attachment.name || 'file';
            link.target = message.attachment.dataUrl ? '_blank' : '';
            link.rel = 'noopener noreferrer';
            link.innerHTML = `
                <span class="attachment-icon">📎</span>
                <span class="attachment-name">${message.attachment.name}</span>
            `;
            messageBubble.appendChild(link);
        }

        // Voice message bubble
        if (message.voice) {
            const vb = document.createElement('div');
            vb.className = 'voice-bubble';
            const play = document.createElement('button');
            play.className = 'input-action-btn';
            play.title = 'Play (simulated)';
            play.innerHTML = '▶️';
            play.addEventListener('click', (e) => { e.stopPropagation(); });
            const wave = document.createElement('div');
            wave.className = 'voice-wave';
            for (let i = 0; i < 10; i++) {
                const bar = document.createElement('span');
                bar.className = 'voice-bar';
                bar.style.height = (8 + Math.floor(Math.random()*12)) + 'px';
                wave.appendChild(bar);
            }
            const dur = document.createElement('span');
            dur.className = 'voice-duration';
            dur.textContent = `${message.voice.duration}s`;
            vb.appendChild(play);
            vb.appendChild(wave);
            vb.appendChild(dur);
            messageBubble.appendChild(vb);
        }

        // Message text (if present and not just the image name)
        if (message.text && message.text !== message.imageName && message.text !== 'Photo') {
            const messageText = document.createElement('div');
            messageText.className = 'message-text';
            messageText.textContent = message.text;
            messageBubble.appendChild(messageText);
        }
    }
    
    // Add quick reaction button (Facebook Messenger style) - only for received messages
    const messageWrapper = document.createElement('div');
    messageWrapper.className = 'message-wrapper';
    messageWrapper.appendChild(messageBubble);
    
    // Only add reaction button for received messages (not sent messages)
    if (!isFromMe) {
        const reactionButton = document.createElement('button');
        reactionButton.className = 'quick-reaction-btn';
        reactionButton.innerHTML = '😀';
        reactionButton.title = 'Add reaction';
        reactionButton.onclick = (event) => {
            event.stopPropagation();
            showQuickReactionPicker(event, message.id);
        };
        messageWrapper.appendChild(reactionButton);
    }
    
    messageContent.appendChild(messageWrapper);
    
    // Add reactions
    if (message.reactions && Object.keys(message.reactions).length > 0) {
        // Add has-reactions class to prevent overlap
        messageDiv.classList.add('has-reactions');
        
        const reactionCounts = {};
        // Handle both old format (1:1 chats) and new format (group chats)
        Object.entries(message.reactions).forEach(([userId, userReactions]) => {
            if (currentChatType === 'group' && typeof userReactions === 'object') {
                // New format: user has multiple reactions with counts
                Object.entries(userReactions).forEach(([emoji, count]) => {
                    reactionCounts[emoji] = (reactionCounts[emoji] || 0) + count;
                });
            } else if (typeof userReactions === 'string') {
                // Old format: user has single reaction
                reactionCounts[userReactions] = (reactionCounts[userReactions] || 0) + 1;
            }
        });
        
        const reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'message-reactions';
        
        // Facebook Messenger style: combine all reactions in single bubble
        const combinedReaction = document.createElement('div');
        combinedReaction.className = 'reaction';
        
        // Check if current user has reacted with any emoji
        let userHasReacted = false;
        if (currentChatType === 'group') {
            userHasReacted = !!(message.reactions[currentUser.id] && Object.keys(message.reactions[currentUser.id]).length > 0);
        } else {
            userHasReacted = !!(message.reactions && message.reactions[currentUser.id]);
        }
        
        if (userHasReacted) {
            combinedReaction.classList.add('user-reacted');
        }
        
        // Calculate total count of all reactions
        const totalCount = Object.values(reactionCounts).reduce((sum, count) => sum + count, 0);
        
        // Add single-reaction class if total count is 1 (to hide count display)
        if (totalCount === 1) {
            combinedReaction.classList.add('single-reaction');
            reactionsDiv.classList.add('single-reaction'); // For CSS positioning fallback
        }
        
        // Add click handler to show all reactions
        combinedReaction.addEventListener('click', (event) => {
            event.stopPropagation();
            // Show reaction picker so user can see all reactions and add/remove
            showQuickReactionPicker(event, message.id);
        });
        
        // Create emoji container for all emojis
        const emojiContainer = document.createElement('span');
        emojiContainer.className = 'reaction-emojis';
        
        // Add all emoji types to the container
        Object.keys(reactionCounts).forEach(emoji => {
            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'reaction-emoji';
            emojiSpan.textContent = emoji;
            emojiContainer.appendChild(emojiSpan);
        });
        
        // Create count span for total count
        const countSpan = document.createElement('span');
        countSpan.className = 'reaction-count';
        countSpan.textContent = totalCount;
        
        combinedReaction.appendChild(emojiContainer);
        combinedReaction.appendChild(countSpan);
        reactionsDiv.appendChild(combinedReaction);
        
        messageWrapper.appendChild(reactionsDiv);
    }
    
    // Add seen status indicators for sent messages
    if (isFromMe && message.seenBy && message.seenBy.length > 0) {
        const seenIndicators = document.createElement('div');
        seenIndicators.className = 'seen-indicators';
        
        // Get users who have seen this message (excluding sender)
        const seenUsers = message.seenBy.filter(userId => userId !== message.senderId);
        
        // Show up to 3 profile pictures
        seenUsers.slice(0, 3).forEach(userId => {
            let user;
            if (currentChatType === 'group') {
                user = users.find(u => u.id === userId);
            } else {
                user = currentChat; // In 1:1 chat, the other person
            }
            
            if (user) {
                const seenAvatar = document.createElement('img');
                seenAvatar.className = 'seen-avatar';
                seenAvatar.src = user.avatarDataUrl || generateDefaultAvatar(user.name);
                seenAvatar.alt = user.name;
                seenAvatar.title = `Seen by ${user.name}`;
                seenAvatar.onerror = function() { this.style.display = 'none'; };
                seenIndicators.appendChild(seenAvatar);
            }
        });
        
        if (seenUsers.length > 0) {
            messageWrapper.appendChild(seenIndicators);
        }
    }
    
    // Avatar/spacer for received messages is handled earlier to avoid duplicates
    
    // For sent messages, no avatar (like Facebook Messenger)
    
    messageDiv.appendChild(messageContent);
    
    return messageDiv;
}

// Message Input Handling
function handleTyping() {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const likeBtn = document.getElementById('likeBtn');
    const leftActions = document.querySelector('.input-actions-left');
    const toggleBtn = document.getElementById('toggleActionsBtn');
    const inputWrapper = document.querySelector('.message-input-wrapper');
    
    const hasText = messageInput.value.trim().length > 0;
    
    // If arrow was clicked with text and user types one character, hide actions
    if (arrowClickedWithText && hasText) {
        arrowClickedWithText = false; // Reset the flag
        leftActions.classList.add('hidden');
        toggleBtn.style.display = 'flex';
        inputWrapper.classList.add('expanded');
    }
    
    if (hasText && !isTyping) {
        isTyping = true;
        sendBtn.style.display = 'flex';
        likeBtn.style.display = 'none';
        
        // Hide left actions and show toggle button (only if not already handled above)
        if (!leftActions.classList.contains('hidden')) {
            leftActions.classList.add('hidden');
            toggleBtn.style.display = 'flex';
            inputWrapper.classList.add('expanded');
        }
        
    } else if (!hasText && isTyping) {
        isTyping = false;
        sendBtn.style.display = 'none';
        likeBtn.style.display = 'flex';
        arrowClickedWithText = false; // Reset flag when no text
        
        // Show left actions and hide toggle button
        leftActions.classList.remove('hidden');
        toggleBtn.style.display = 'none';
        inputWrapper.classList.remove('expanded');
    }
}

// Toggle actions visibility
function toggleActions() {
    const messageInput = document.getElementById('messageInput');
    const leftActions = document.querySelector('.input-actions-left');
    const toggleBtn = document.getElementById('toggleActionsBtn');
    const inputWrapper = document.querySelector('.message-input-wrapper');
    
    const hasText = messageInput.value.trim().length > 0;
    
    if (leftActions.classList.contains('hidden')) {
        // Show actions (arrow was clicked while there's text)
        if (hasText) {
            arrowClickedWithText = true;
        }
        leftActions.classList.remove('hidden');
        toggleBtn.style.display = 'none';
        inputWrapper.classList.remove('expanded');
    } else {
        // Hide actions
        leftActions.classList.add('hidden');
        toggleBtn.style.display = 'flex';
        inputWrapper.classList.add('expanded');
    }
}

function handleSendMessage() {
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();
    
    if (!text || !currentChat) return;
    
    // Clear input first
    messageInput.value = '';
    handleTyping(); // Reset send button state
    autoResizeTextarea(messageInput); // Reset textarea height immediately
    
    // Update user's last active time
    currentUser.lastActive = new Date();
    
    // For Mimi, send message directly without action options
    if (currentChatType === 'user' && currentChat.id === 'mimi') {
        const message = addMessage(currentUser.id, text);
        renderMessages();
        cancelReply(); // Clear reply state
        
        // Handle Mimi interaction
        handleMimiInteraction(text, message.id);
        return;
    }
    
    // Show action options for send/receive (includes reply info)
    showActionOptions(text);
}

function showActionOptions(messageText) {
    const modal = document.getElementById('actionOptionsModal');
    const list = document.getElementById('actionOptionsList');
    list.innerHTML = '';
    
    if (currentChatType === 'user') {
        // Individual chat options
        const sendOption = document.createElement('div');
        sendOption.className = 'action-option send-option';
        sendOption.textContent = `Send as ${currentUser.name}`;
        sendOption.addEventListener('click', () => {
            const message = addMessage(currentUser.id, messageText);
            renderMessages();
            cancelReply(); // Clear reply state
            hideActionOptions();
            
            // Handle Mimi interaction if chatting with Mimi
            if (currentChat.id === 'mimi') {
                handleMimiInteraction(messageText, message.id);
            }
        });
        
        const receiveOption = document.createElement('div');
        receiveOption.className = 'action-option receive-option';
        receiveOption.textContent = `Receive from ${currentChat.name}`;
        receiveOption.addEventListener('click', () => {
            addMessage(currentChat.id, messageText);
            renderMessages();
            cancelReply(); // Clear reply state
            hideActionOptions();
        });
        
        list.appendChild(sendOption);
        list.appendChild(receiveOption);
    } else {
        // Group chat options
        const myOption = document.createElement('div');
        myOption.className = 'action-option send-option';
        myOption.textContent = `Send as ${currentUser.name}`;
        myOption.addEventListener('click', () => {
            const message = addMessage(currentUser.id, messageText);
            renderMessages();
            cancelReply(); // Clear reply state
            hideActionOptions();
            
            // Handle Mimi interaction in group chats
            if (currentChatType === 'group' && currentChat.members && currentChat.members.includes('mimi')) {
                handleMimiGroupInteraction(messageText, message.id, currentChat.id);
            }
        });
        list.appendChild(myOption);
        
        // Add group members
        currentChat.members.forEach(memberId => {
            const user = users.find(u => u.id === memberId);
            if (user) {
                const option = document.createElement('div');
                option.className = 'action-option receive-option';
                option.textContent = `Send as ${user.name}`;
                option.addEventListener('click', () => {
                    addMessage(user.id, messageText);
                    renderMessages();
                    cancelReply(); // Clear reply state
                    hideActionOptions();
                });
                list.appendChild(option);
            }
        });
    }
    
    modal.style.display = 'block';
}

function hideActionOptions() {
    const modal = document.getElementById('actionOptionsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showActionOptionsForImage(imageDataUrl, imageName) {
    // Safety check
    if (!currentChat) return;
    
    // For Mimi, send image directly without action options
    if (currentChatType === 'user' && currentChat.id === 'mimi') {
        const message = addMessage(currentUser.id, imageName || 'Photo', imageDataUrl, imageName);
        renderMessages();
        cancelReply(); // Clear reply state
        
        // Handle Mimi interaction for image messages
        handleMimiInteraction(imageName || 'Photo', message.id);
        return;
    }
    
    const modal = document.getElementById('actionOptionsModal');
    const list = document.getElementById('actionOptionsList');
    list.innerHTML = '';
    
    if (currentChatType === 'user') {
        // Individual chat options for image
        const sendOption = document.createElement('div');
        sendOption.className = 'action-option send-option';
        sendOption.textContent = `Send photo as ${currentUser.name}`;
        sendOption.addEventListener('click', () => {
            const message = addMessage(currentUser.id, imageName || 'Photo', imageDataUrl, imageName);
            renderMessages();
            cancelReply(); // Clear reply state
            hideActionOptions();
            
            // Handle Mimi interaction for image messages
            if (currentChat.id === 'mimi') {
                handleMimiInteraction(imageName || 'Photo', message.id);
            }
        });
        
        const receiveOption = document.createElement('div');
        receiveOption.className = 'action-option receive-option';
        receiveOption.textContent = `Receive photo from ${currentChat.name}`;
        receiveOption.addEventListener('click', () => {
            addMessage(currentChat.id, imageName || 'Photo', imageDataUrl, imageName);
            renderMessages();
            cancelReply(); // Clear reply state
            hideActionOptions();
        });
        
        list.appendChild(sendOption);
        list.appendChild(receiveOption);
    } else {
        // Group chat options for image
        const myOption = document.createElement('div');
        myOption.className = 'action-option send-option';
        myOption.textContent = `Send photo as ${currentUser.name}`;
        myOption.addEventListener('click', () => {
            const message = addMessage(currentUser.id, imageName || 'Photo', imageDataUrl, imageName);
            renderMessages();
            cancelReply(); // Clear reply state
            hideActionOptions();
            
            // Handle Mimi interaction for image messages in groups
            if (currentChatType === 'group' && currentChat.members && currentChat.members.includes('mimi')) {
                handleMimiGroupInteraction(imageName || 'Photo', message.id, currentChat.id);
            }
        });
        list.appendChild(myOption);
        
        // Add group members
        currentChat.members.forEach(memberId => {
            const user = users.find(u => u.id === memberId);
            if (user) {
                const option = document.createElement('div');
                option.className = 'action-option receive-option';
                option.textContent = `Send photo as ${user.name}`;
                option.addEventListener('click', () => {
                    addMessage(user.id, imageName || 'Photo', imageDataUrl, imageName);
                    renderMessages();
                    cancelReply(); // Clear reply state
                    hideActionOptions();
                });
                list.appendChild(option);
            }
        });
    }
    
    modal.style.display = 'block';
}

// Action options for non-image file attachments
function showActionOptionsForAttachment(fileMeta) {
    if (!currentChat) return;
    const modal = document.getElementById('actionOptionsModal');
    const list = document.getElementById('actionOptionsList');
    list.innerHTML = '';
    const label = fileMeta && fileMeta.name ? `(${fileMeta.name})` : '';
    
    if (currentChatType === 'user') {
        const sendOption = document.createElement('div');
        sendOption.className = 'action-option send-option';
        sendOption.textContent = `Send file ${label} as ${currentUser.name}`;
        sendOption.addEventListener('click', () => {
            addAttachmentMessage(currentUser.id, fileMeta);
            renderMessages();
            cancelReply();
            hideActionOptions();
        });
        const receiveOption = document.createElement('div');
        receiveOption.className = 'action-option receive-option';
        receiveOption.textContent = `Receive file ${label} from ${currentChat.name}`;
        receiveOption.addEventListener('click', () => {
            addAttachmentMessage(currentChat.id, fileMeta);
            renderMessages();
            cancelReply();
            hideActionOptions();
        });
        list.appendChild(sendOption);
        list.appendChild(receiveOption);
    } else {
        const myOption = document.createElement('div');
        myOption.className = 'action-option send-option';
        myOption.textContent = `Send file ${label} as ${currentUser.name}`;
        myOption.addEventListener('click', () => {
            addAttachmentMessage(currentUser.id, fileMeta);
            renderMessages();
            cancelReply();
            hideActionOptions();
        });
        list.appendChild(myOption);
        currentChat.members.forEach(memberId => {
            const user = users.find(u => u.id === memberId);
            if (user) {
                const option = document.createElement('div');
                option.className = 'action-option receive-option';
                option.textContent = `Send file ${label} as ${user.name}`;
                option.addEventListener('click', () => {
                    addAttachmentMessage(user.id, fileMeta);
                    renderMessages();
                    cancelReply();
                    hideActionOptions();
                });
                list.appendChild(option);
            }
        });
    }
    modal.style.display = 'block';
}

function addAttachmentMessage(senderId, fileMeta) {
    const message = {
        id: 'msg_' + messageIdCounter++,
        senderId: senderId,
        text: fileMeta.name || 'Attachment',
        timestamp: new Date().toISOString(),
        reactions: {},
        edited: false,
        seenBy: [],
        attachment: {
            name: fileMeta.name || 'file',
            size: fileMeta.size || 0,
            dataUrl: fileMeta.dataUrl || null
        }
    };
    if (replyingToMessage) {
        message.replyTo = {
            messageId: replyingToMessage.id,
            senderId: replyingToMessage.senderId,
            text: replyingToMessage.text
        };
    }
    if (!currentChat.messages) currentChat.messages = [];
    currentChat.messages.push(message);
    markMessageAsSeen(message.id, senderId);
    saveAllData();
    return message;
}

// Simulated voice message options and creation
function showVoiceSendOptions() {
    const modal = document.getElementById('actionOptionsModal');
    const list = document.getElementById('actionOptionsList');
    list.innerHTML = '';
    const makeVoice = (senderId) => {
        const dur = Math.floor(5 + Math.random() * 25); // 5-30s
        addVoiceMessage(senderId, dur);
        renderMessages();
        hideActionOptions();
    };
    if (currentChatType === 'user') {
        const sendOption = document.createElement('div');
        sendOption.className = 'action-option send-option';
        sendOption.textContent = `Send voice as ${currentUser.name}`;
        sendOption.addEventListener('click', () => makeVoice(currentUser.id));
        const receiveOption = document.createElement('div');
        receiveOption.className = 'action-option receive-option';
        receiveOption.textContent = `Receive voice from ${currentChat.name}`;
        receiveOption.addEventListener('click', () => makeVoice(currentChat.id));
        list.appendChild(sendOption);
        list.appendChild(receiveOption);
    } else {
        const myOption = document.createElement('div');
        myOption.className = 'action-option send-option';
        myOption.textContent = `Send voice as ${currentUser.name}`;
        myOption.addEventListener('click', () => makeVoice(currentUser.id));
        list.appendChild(myOption);
        currentChat.members.forEach(memberId => {
            const user = users.find(u => u.id === memberId);
            if (user) {
                const option = document.createElement('div');
                option.className = 'action-option receive-option';
                option.textContent = `Send voice as ${user.name}`;
                option.addEventListener('click', () => makeVoice(user.id));
                list.appendChild(option);
            }
        });
    }
    modal.style.display = 'block';
}

function addVoiceMessage(senderId, durationSeconds) {
    const message = {
        id: 'msg_' + messageIdCounter++,
        senderId: senderId,
        text: '',
        timestamp: new Date().toISOString(),
        reactions: {},
        edited: false,
        seenBy: [],
        voice: {
            duration: durationSeconds
        }
    };
    if (replyingToMessage) {
        message.replyTo = {
            messageId: replyingToMessage.id,
            senderId: replyingToMessage.senderId,
            text: replyingToMessage.text
        };
    }
    if (!currentChat.messages) currentChat.messages = [];
    currentChat.messages.push(message);
    markMessageAsSeen(message.id, senderId);
    saveAllData();
    return message;
}

function showEmojiPicker() {
    const emojiPicker = document.getElementById('emojiPicker');
    if (emojiPicker) {
        emojiPicker.style.display = 'block';
        emojiPicker.style.position = 'fixed';
        emojiPicker.style.bottom = '120px';
        emojiPicker.style.left = '50%';
        emojiPicker.style.transform = 'translateX(-50%)';
        emojiPicker.style.zIndex = '1000';
    }
}

function addMessage(senderId, text, imageDataUrl = null, imageName = null) {
    const message = {
        id: 'msg_' + messageIdCounter++,
        senderId: senderId,
        text: text,
        timestamp: new Date().toISOString(),
        reactions: {},
        edited: false,
        seenBy: [], // Track who has seen this message
        imageDataUrl: imageDataUrl, // Store image data URL if present
        imageName: imageName // Store original image filename
    };
    
    // Add reply information if replying to a message
    if (replyingToMessage) {
        message.replyTo = {
            messageId: replyingToMessage.id,
            senderId: replyingToMessage.senderId,
            text: replyingToMessage.text
        };
    }
    
    if (!currentChat.messages) {
        currentChat.messages = [];
    }
    
    currentChat.messages.push(message);
    
    // Auto-mark as seen by sender
    markMessageAsSeen(message.id, senderId);
    
    // Save to IndexedDB
    saveAllData();
    
    return message;
}

// Quick Reaction
function sendQuickReaction() {
    if (!currentChat) return;
    
    const message = {
        id: 'msg_' + messageIdCounter++,
        senderId: currentUser.id,
        text: quickReactionEmoji,
        timestamp: new Date().toISOString(),
        reactions: {},
        edited: false
    };
    
    if (!currentChat.messages) {
        currentChat.messages = [];
    }
    
    currentChat.messages.push(message);
    saveAllData(); // Save to IndexedDB
    renderMessages();
}

function showQuickReactionPicker() {
    const emojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👎'];
    
    // Create a simple prompt-based picker for mobile
    let emojiList = 'Choose quick reaction emoji:\n';
    emojis.forEach((emoji, index) => {
        emojiList += `${index + 1}. ${emoji}\n`;
    });
    
    const choice = prompt(emojiList + '\nEnter number (1-8):');
    const index = parseInt(choice) - 1;
    
    if (index >= 0 && index < emojis.length) {
        quickReactionEmoji = emojis[index];
        document.getElementById('quickReactionEmoji').textContent = quickReactionEmoji;
    }
}

// Context Menu Functions (simplified for mobile)
function showMessageContextMenu(event, messageId) {
    contextMenuTargetMessage = messageId;
    
    const contextMenu = document.getElementById('messageContextMenu');
    contextMenu.style.display = 'block';
    
    // Position the context menu near the touch/click point
    const rect = event.target.getBoundingClientRect();
    contextMenu.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
    contextMenu.style.top = (rect.top - 120) + 'px';
    
    // Ensure it's within viewport
    if (parseInt(contextMenu.style.top) < 20) {
        contextMenu.style.top = '20px';
    }
    
    // Hide after 5 seconds if not interacted
    setTimeout(() => {
        if (contextMenu.style.display === 'block') {
            hideContextMenu();
        }
    }, 5000);
}

function hideContextMenu() {
    const contextMenu = document.getElementById('messageContextMenu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
    contextMenuTargetMessage = null;
}

function editMessage() {
    if (!contextMenuTargetMessage) return;
    
    const message = findMessage(contextMenuTargetMessage);
    if (!message) return;
    
    const newText = prompt('Edit message:', message.text);
    if (newText && newText.trim()) {
        message.text = newText.trim();
        message.edited = true;
        saveAllData(); // Save to IndexedDB
        renderMessages();
    }
    
    hideContextMenu();
}

function deleteMessage() {
    if (!contextMenuTargetMessage) return;
    
    const confirmed = confirm('Delete this message?');
    if (confirmed) {
        const messageIndex = currentChat.messages.findIndex(m => m.id === contextMenuTargetMessage);
        if (messageIndex !== -1) {
            currentChat.messages.splice(messageIndex, 1);
            saveAllData(); // Save to IndexedDB
            renderMessages();
        }
    }
    
    hideContextMenu();
}

function replyToMessage() {
    if (!contextMenuTargetMessage) return;
    
    const message = findMessage(contextMenuTargetMessage);
    if (!message) return;
    
    replyingToMessage = message;
    
    // Show reply preview
    const replyPreview = document.getElementById('replyPreview');
    const replyPreviewName = document.getElementById('replyPreviewName');
    const replyPreviewText = document.getElementById('replyPreviewText');
    
    // Get sender name
    let senderName;
    if (message.senderId === currentUser.id) {
        senderName = 'yourself';
    } else if (currentChatType === 'group') {
        const sender = users.find(u => u.id === message.senderId);
        senderName = sender ? sender.name : 'Unknown';
    } else {
        senderName = currentChat.name;
    }
    
    // Facebook Messenger style: "Replying to [username]"
    replyPreviewName.textContent = `Replying to ${senderName}`;
    replyPreviewText.textContent = message.text;
    replyPreview.style.display = 'block';
    
    // Focus input
    const messageInput = document.getElementById('messageInput');
    messageInput.focus();
    
    hideContextMenu();
}

function cancelReply() {
    replyingToMessage = null;
    const replyPreview = document.getElementById('replyPreview');
    replyPreview.style.display = 'none';
}

function reactToMessage() {
    if (!contextMenuTargetMessage) return;
    
    // Hide context menu first
    hideContextMenu();
    
    // Show emoji picker
    const emojiPicker = document.getElementById('emojiPicker');
    emojiPicker.style.display = 'block';
    emojiPicker.style.position = 'fixed';
    emojiPicker.style.bottom = '120px';
    emojiPicker.style.left = '50%';
    emojiPicker.style.transform = 'translateX(-50%)';
    emojiPicker.style.zIndex = '1000';
}

function hideEmojiPicker() {
    const emojiPicker = document.getElementById('emojiPicker');
    if (emojiPicker) {
        emojiPicker.style.display = 'none';
    }
}

// Image Preview Modal Functions
function showImagePreview(imageDataUrl) {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('imagePreviewImg');
    
    if (modal && img) {
        img.src = imageDataUrl;
        modal.style.display = 'block';
        
        // Close modal when clicking on background
        modal.onclick = function(event) {
            if (event.target === modal) {
                hideImagePreview();
            }
        };
        
        // Close modal with Escape key
        document.addEventListener('keydown', function escapeHandler(event) {
            if (event.key === 'Escape') {
                hideImagePreview();
                document.removeEventListener('keydown', escapeHandler);
            }
        });
    }
}

function hideImagePreview() {
    const modal = document.getElementById('imagePreviewModal');
    if (modal) {
        modal.style.display = 'none';
        // Remove click listener to prevent memory leaks
        modal.onclick = null;
    }
}

// Rules Modal Functions
let rulesModalEscapeHandler = null;

function showRulesModal() {
    const modal = document.getElementById('rulesModal');
    if (modal) {
        modal.style.display = 'block';
        
        // Close modal when clicking on background
        modal.onclick = function(event) {
            if (event.target === modal) {
                hideRulesModal();
            }
        };
        
        // Create single escape handler
        rulesModalEscapeHandler = function(event) {
            if (event.key === 'Escape') {
                hideRulesModal();
            }
        };
        
        // Add escape key listener
        document.addEventListener('keydown', rulesModalEscapeHandler);
        
        // Scroll to top when modal opens
        setTimeout(() => {
            modal.scrollTop = 0;
        }, 100);
    }
}

function hideRulesModal() {
    const modal = document.getElementById('rulesModal');
    if (modal) {
        modal.style.display = 'none';
        // Remove click listener to prevent memory leaks
        modal.onclick = null;
        
        // Remove escape key listener
        if (rulesModalEscapeHandler) {
            document.removeEventListener('keydown', rulesModalEscapeHandler);
            rulesModalEscapeHandler = null;
        }
    }
}

function findMessage(messageId) {
    return currentChat.messages.find(m => m.id === messageId);
}

// Emoji Selection for Reactions
function selectEmoji(emoji) {
    // Toggle reaction to message
    if (contextMenuTargetMessage) {
        const message = findMessage(contextMenuTargetMessage);
        if (message) {
            if (!message.reactions) {
                message.reactions = {};
            }
            
            // Toggle reaction: remove if same emoji, add if different or none
            if (message.reactions[currentUser.id] === emoji) {
                // Remove the reaction
                delete message.reactions[currentUser.id];
            } else {
                // Add or change the reaction
                message.reactions[currentUser.id] = emoji;
            }
            saveAllData(); // Save to IndexedDB
            renderMessages();
        }
        contextMenuTargetMessage = null;
    }
    hideEmojiPicker();
}

// Quick reaction picker for the reaction button
function showQuickReactionPicker(event, messageId) {
    // Create quick reaction picker if it doesn't exist
    let quickPicker = document.getElementById('quickReactionPicker');
    if (!quickPicker) {
        quickPicker = document.createElement('div');
        quickPicker.id = 'quickReactionPicker';
        quickPicker.className = 'quick-reaction-picker';
        quickPicker.innerHTML = `
            <div class="quick-menu-content">
                <div class="quick-reaction-grid">
                    <span class="quick-emoji" data-emoji="👍">👍</span>
                    <span class="quick-emoji" data-emoji="❤️">❤️</span>
                    <span class="quick-emoji" data-emoji="😂">😂</span>
                    <span class="quick-emoji" data-emoji="😮">😮</span>
                    <span class="quick-emoji" data-emoji="😢">😢</span>
                    <span class="quick-emoji" data-emoji="😡">😡</span>
                    <span class="quick-emoji" data-emoji="🔥">🔥</span>
                </div>
                <div class="quick-actions">
                    <button class="quick-action-btn" data-action="reply">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
                        </svg>
                        Reply
                    </button>
                    <button class="quick-action-btn" data-action="edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                        Edit
                    </button>
                    <button class="quick-action-btn" data-action="delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                        Delete
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(quickPicker);
        
        // Use event delegation to handle clicks
        quickPicker.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const emojiElement = e.target.closest('.quick-emoji');
            const actionElement = e.target.closest('.quick-action-btn');
            
            if (emojiElement) {
                const selectedEmoji = emojiElement.dataset.emoji;
                if (currentChatType === 'group') {
                    showReactionCountPicker(selectedEmoji, contextMenuTargetMessage);
                } else {
                    addQuickReaction(contextMenuTargetMessage, selectedEmoji);
                }
                hideQuickReactionPicker();
            } else if (actionElement) {
                const action = actionElement.dataset.action;
                switch(action) {
                    case 'reply':
                        replyToMessage();
                        break;
                    case 'edit':
                        editMessage();
                        break;
                    case 'delete':
                        deleteMessage();
                        break;
                }
                hideQuickReactionPicker();
            }
        });
    }
    
    // Set the current message for reaction
    contextMenuTargetMessage = messageId;
    
    // Position the picker near the reaction button with viewport clamping
    const rect = event.target.getBoundingClientRect();
    const pickerWidth = 320; // Increased width for combined menu
    const pickerHeight = 120; // Increased height for action buttons
    
    let top = rect.top - pickerHeight - 8;
    let left = rect.left - pickerWidth / 2;
    
    // Clamp to viewport bounds
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Adjust horizontal position
    if (left < 8) left = 8;
    if (left + pickerWidth > viewportWidth - 8) left = viewportWidth - pickerWidth - 8;
    
    // Adjust vertical position
    if (top < 8) top = rect.bottom + 8; // Show below if no space above
    if (top + pickerHeight > viewportHeight - 8) top = viewportHeight - pickerHeight - 8;
    
    quickPicker.style.position = 'fixed';
    quickPicker.style.top = top + 'px';
    quickPicker.style.left = left + 'px';
    quickPicker.style.display = 'block';
    quickPicker.style.zIndex = '1000';
    
    // Hide picker when clicking outside or pressing Escape
    // Add a longer delay to prevent immediate closing when releasing mouse button
    setTimeout(() => {
        document.addEventListener('click', hideQuickReactionPicker, { once: true });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideQuickReactionPicker();
            }
        }, { once: true });
    }, 500); // Increased delay to 500ms
}

function hideQuickReactionPicker() {
    const quickPicker = document.getElementById('quickReactionPicker');
    if (quickPicker) {
        quickPicker.style.display = 'none';
    }
}

function showReactionCountPicker(emoji, messageId) {
    const count = prompt(`How many ${emoji} reactions would you like to add?`, '1');
    if (count && !isNaN(count) && parseInt(count) > 0) {
        addQuickReaction(messageId, emoji, parseInt(count));
    }
}

function addQuickReaction(messageId, emoji, count = 1) {
    const message = findMessage(messageId);
    if (message) {
        if (!message.reactions) {
            message.reactions = {};
        }
        
        // For group chats, support multiple reactions with counts
        if (currentChatType === 'group') {
            if (!message.reactions[currentUser.id]) {
                message.reactions[currentUser.id] = {};
            }
            // Add or update the count for this emoji
            if (message.reactions[currentUser.id][emoji]) {
                message.reactions[currentUser.id][emoji] += count;
            } else {
                message.reactions[currentUser.id][emoji] = count;
            }
        } else {
            // For 1:1 chats, keep the original behavior
            if (message.reactions[currentUser.id] === emoji) {
                delete message.reactions[currentUser.id];
            } else {
                message.reactions[currentUser.id] = emoji;
            }
        }
        saveAllData(); // Save to IndexedDB
        renderMessages();
    }
}

// Seen Status Functions
function markMessageAsSeen(messageId, userId) {
    const message = findMessage(messageId);
    if (message && !message.seenBy.includes(userId)) {
        message.seenBy.push(userId);
        saveAllData(); // Save to IndexedDB
    }
}

function markAllMessagesAsSeenByCurrentUser() {
    if (!currentChat || !currentChat.messages) return;
    
    currentChat.messages.forEach(message => {
        if (message.senderId !== currentUser.id) {
            markMessageAsSeen(message.id, currentUser.id);
        }
    });
    renderMessages();
}

// Status Text Editing
function editStatusText() {
    if (currentChatType !== 'user') return;
    
    const newStatus = prompt('Enter new status:', currentChat.statusText);
    if (newStatus !== null) {
        currentChat.statusText = newStatus.trim() || 'Available';
        document.getElementById('chatStatus').textContent = currentChat.statusText;
        
        // Save to IndexedDB
        saveAllData();
        
        // Update in sidebar
        renderContacts();
    }
}

// Auto-resize textarea function (Facebook Messenger style)
function autoResizeTextarea(textarea) {
    // Reset height to calculate scrollHeight properly
    textarea.style.height = 'auto';
    
    // Set height based on content, with max limit of 120px
    const newHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = newHeight + 'px';
    
    // Update wrapper alignment for better visual appearance
    const wrapper = textarea.closest('.message-input-wrapper');
    if (wrapper) {
        // For multi-line text, align to bottom for better visual balance
        wrapper.style.alignItems = textarea.scrollHeight > 32 ? 'flex-end' : 'center';
    }
    
    // Ensure smooth scrolling when content exceeds max height
    if (textarea.scrollHeight > 120) {
        textarea.scrollTop = textarea.scrollHeight;
    }
}

// Dark Mode Functions
function toggleDarkMode() {
    const body = document.body;
    const isCurrentlyDark = body.getAttribute('data-theme') === 'dark';
    const lightIcon = document.querySelector('#darkModeToggle .light-icon');
    const darkIcon = document.querySelector('#darkModeToggle .dark-icon');
    
    if (isCurrentlyDark) {
        // Switch to light mode
        body.removeAttribute('data-theme');
        lightIcon.style.display = 'block';
        darkIcon.style.display = 'none';
        localStorage.setItem('darkMode', 'false');
    } else {
        // Switch to dark mode
        body.setAttribute('data-theme', 'dark');
        lightIcon.style.display = 'none';
        darkIcon.style.display = 'block';
        localStorage.setItem('darkMode', 'true');
    }
}

function loadDarkModePreference() {
    const darkModeEnabled = localStorage.getItem('darkMode') === 'true';
    const body = document.body;
    const lightIcon = document.querySelector('#darkModeToggle .light-icon');
    const darkIcon = document.querySelector('#darkModeToggle .dark-icon');
    
    if (darkModeEnabled) {
        body.setAttribute('data-theme', 'dark');
        if (lightIcon) lightIcon.style.display = 'none';
        if (darkIcon) darkIcon.style.display = 'block';
    } else {
        body.removeAttribute('data-theme');
        if (lightIcon) lightIcon.style.display = 'block';
        if (darkIcon) darkIcon.style.display = 'none';
    }
}

function initializeDarkMode() {
    // Load saved preference
    loadDarkModePreference();
    
    // Add event listener to toggle button
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', toggleDarkMode);
    }
}

// Utility Functions
function generateId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Mimi Chat System
let mimiResponses = null;

// Load Mimi response data
async function loadMimiResponses() {
    if (mimiResponses) return mimiResponses;
    
    try {
        const response = await fetch('mimi.json');
        mimiResponses = await response.json();
        return mimiResponses;
    } catch (error) {
        console.error('Error loading mimi.json:', error);
        return {};
    }
}

// Calculate string similarity using Jaro-Winkler distance
function calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    
    str1 = str1.toLowerCase().trim();
    str2 = str2.toLowerCase().trim();
    
    if (str1 === str2) return 1.0;
    
    const maxDistance = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
    const matches1 = new Array(str1.length).fill(false);
    const matches2 = new Array(str2.length).fill(false);
    let matches = 0;
    let transpositions = 0;
    
    // Find matches
    for (let i = 0; i < str1.length; i++) {
        const start = Math.max(0, i - maxDistance);
        const end = Math.min(i + maxDistance + 1, str2.length);
        
        for (let j = start; j < end; j++) {
            if (matches2[j] || str1[i] !== str2[j]) continue;
            matches1[i] = matches2[j] = true;
            matches++;
            break;
        }
    }
    
    if (matches === 0) return 0.0;
    
    // Find transpositions
    let k = 0;
    for (let i = 0; i < str1.length; i++) {
        if (!matches1[i]) continue;
        while (!matches2[k]) k++;
        if (str1[i] !== str2[k]) transpositions++;
        k++;
    }
    
    const jaro = (matches / str1.length + matches / str2.length + (matches - transpositions / 2) / matches) / 3;
    
    // Apply Winkler modification
    let prefix = 0;
    for (let i = 0; i < Math.min(str1.length, str2.length, 4); i++) {
        if (str1[i] === str2[i]) prefix++;
        else break;
    }
    
    return jaro + 0.1 * prefix * (1 - jaro);
}

// Normalize text: lowercase, trim, remove extra spaces, basic punctuation and ZWJ/ZWNJ
function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/[\u200C\u200D]/g, '') // remove ZWNJ/ZWJ
        .replace(/[\p{P}\p{S}]+/gu, ' ') // remove punctuation/symbols (unicode)
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenSet(text) {
    return new Set(normalizeText(text).split(' ').filter(Boolean));
}

function jaccardSimilarity(a, b) {
    const setA = tokenSet(a);
    const setB = tokenSet(b);
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    setA.forEach(t => { if (setB.has(t)) intersection++; });
    const union = setA.size + setB.size - intersection;
    return intersection / union;
}

function containsSimilarity(text, pattern) {
    const nt = normalizeText(text);
    const np = normalizeText(pattern);
    if (!nt || !np) return 0;
    if (nt === np) return 1;
    if (nt.includes(np)) return Math.min(0.95, Math.max(np.length / (nt.length + 0.0001), 0.7));
    return 0;
}

// Find best matching response for user message using combined metrics
async function findMimiResponse(userMessage) {
    const responses = await loadMimiResponses();
    if (!responses) return null;
    const normalizedUser = normalizeText(userMessage);
    const PRIMARY_THRESHOLD = 0.7; // strong match
    const SECONDARY_THRESHOLD = 0.55; // fallback match
    let bestMatch = null;
    let bestSimilarity = 0;
    // Check each question in mimi.json
    for (const [question, answers] of Object.entries(responses)) {
        // Combine multiple similarity signals
        const jw = calculateSimilarity(normalizedUser, question);
        const jc = jaccardSimilarity(normalizedUser, question);
        const cont = containsSimilarity(normalizedUser, question);
        const similarity = Math.max(jw, jc, cont);
        if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = { question, answers, similarity };
        }
    }
    if (bestMatch && bestSimilarity >= PRIMARY_THRESHOLD) return bestMatch;
    if (bestMatch && bestSimilarity >= SECONDARY_THRESHOLD) return bestMatch;
    return null;
}

// Get random emoji from Mimi's reaction list
function getRandomMimiEmoji() {
    const emojis = ['🙃', '😑', '😌', '🤫', '😉', '😘'];
    return emojis[Math.floor(Math.random() * emojis.length)];
}

// Handle Mimi auto-response and reactions
async function handleMimiInteraction(userMessage, messageId) {
    if (!currentChat || currentChat.id !== 'mimi') return;
    
    // Add random emoji reaction to user's message immediately
    setTimeout(() => {
        const randomEmoji = getRandomMimiEmoji();
        const message = findMessage(messageId);
        if (message) {
            if (!message.reactions) message.reactions = {};
            message.reactions['mimi'] = randomEmoji;
            saveAllData(); // Save to IndexedDB
            renderMessages();
        }
    }, 500 + Math.random() * 1000); // Random delay between 0.5-1.5 seconds
    
    // Find and send response
    const match = await findMimiResponse(userMessage);
    if (match && match.answers && match.answers.length > 0) {
        // Random delay before responding (1-3 seconds)
        setTimeout(() => {
            const randomAnswer = match.answers[Math.floor(Math.random() * match.answers.length)];
            addMessage('mimi', randomAnswer);
            renderMessages();
        }, 1000 + Math.random() * 2000);
    } else {
        // Fallback response when no match is found
        setTimeout(() => {
            const fallbackResponses = ["🤔", "হুম", "আচ্ছা", "ওহ"];
            const randomFallback = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
            addMessage('mimi', randomFallback);
            renderMessages();
        }, 1500 + Math.random() * 1500);
    }
}

// Handle Mimi interactions in groups
async function handleMimiGroupInteraction(userMessage, messageId, groupId) {
    // Check if Mimi is in this group
    const group = groups.find(g => g.id === groupId);
    if (!group || !group.members.includes('mimi')) return;
    
    // Add random emoji reaction to user's message
    setTimeout(() => {
        const randomEmoji = getRandomMimiEmoji();
        const message = findMessage(messageId);
        if (message) {
            if (!message.reactions) message.reactions = {};
            message.reactions['mimi'] = randomEmoji;
            saveAllData(); // Save to IndexedDB
            renderMessages();
        }
    }, 500 + Math.random() * 1000);
    
    // Find and send response (deterministic 70% similarity threshold in groups too)
    const match = await findMimiResponse(userMessage);
    if (match && match.answers && match.answers.length > 0) {
        setTimeout(() => {
            const randomAnswer = match.answers[Math.floor(Math.random() * match.answers.length)];
            addMessage('mimi', randomAnswer);
            renderMessages();
        }, 1000 + Math.random() * 3000);
    } else {
        // Fallback response for groups
        setTimeout(() => {
            const fallbackResponses = ["😑", "🙃", "হুম"];
            const randomFallback = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
            addMessage('mimi', randomFallback);
            renderMessages();
        }, 2000 + Math.random() * 2000);
    }
}