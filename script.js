let localStream;
let peerConnection;
let dataChannel;
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const offerText = document.getElementById("offerText");
const answerText = document.getElementById("answerText");

const startCallBtn = document.getElementById("startCall");
const acceptCallBtn = document.getElementById("acceptCall");
const connectBtn = document.getElementById("connect");
const copyOfferBtn = document.getElementById("copyOffer");

const toggleMicBtn = document.getElementById("toggleMic");
const toggleCamBtn = document.getElementById("toggleCam");

const localUsernameDisplay = document.getElementById("localUsernameDisplay");
const remoteUsernameDisplay = document.getElementById("remoteUsernameDisplay");

const friendsContainer = document.getElementById("friendsContainer");
const myNameInput = document.getElementById("myNameInput");
const friendIdInput = document.getElementById("friendIdInput");
const addFriendBtn = document.getElementById("addFriendBtn");
const myIdDisplay = document.getElementById("myId");

const toggleManualBtn = document.getElementById("toggleManualBtn");
const manualContainer = document.getElementById("manualContainer");

let myId = localStorage.getItem("myId") || generateId();
myIdDisplay.textContent = myId;
localStorage.setItem("myId", myId);

let localUsername = localStorage.getItem("myName") || "User1";
myNameInput.value = localUsername;
localUsernameDisplay.textContent = localUsername;

let friends = JSON.parse(localStorage.getItem("friends")) || {};
let audioContext, analyser, microphone;

function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function loadFriends() {
    friendsContainer.innerHTML = "";
    for (const [id, name] of Object.entries(friends)) {
        const friendDiv = document.createElement("div");
        friendDiv.className = "friend-item";
        friendDiv.innerHTML = `<span>${name} (${id.slice(0, 8)}...)</span><button onclick="callFriend('${id}')">Позвонить</button>`;
        friendsContainer.appendChild(friendDiv);
    }
}

myNameInput.oninput = () => {
    localUsername = myNameInput.value.trim() || "User1";
    localStorage.setItem("myName", localUsername);
    localUsernameDisplay.textContent = localUsername;
    sendUsernameAndMicState();
};

myIdDisplay.onclick = (e) => {
    e.preventDefault();
    navigator.clipboard.writeText(myId).then(() => {
        alert("Ваш ID скопирован в буфер обмена!");
    }).catch(err => {
        console.error("Ошибка копирования:", err);
        alert("Не удалось скопировать ID. Попробуйте вручную.");
    });
};

addFriendBtn.onclick = () => {
    const id = friendIdInput.value.trim();
    if (id && id !== myId && !friends[id]) {
        friends[id] = "Неизвестный";
        localStorage.setItem("friends", JSON.stringify(friends));
        loadFriends();
        friendIdInput.value = "";
        if (dataChannel && dataChannel.readyState === "open") {
            dataChannel.send(JSON.stringify({ type: "friendRequest", fromId: myId, fromName: localUsername, to: id }));
        } else {
            setupPeerConnection(true).then(() => {
                dataChannel.onopen = () => {
                    dataChannel.send(JSON.stringify({ type: "friendRequest", fromId: myId, fromName: localUsername, to: id }));
                };
            });
        }
    }
};

startCallBtn.onclick = async () => {
    await setupPeerConnection(true);
};

acceptCallBtn.onclick = async () => {
    await setupPeerConnection(false);
};

connectBtn.onclick = async () => {
    const answer = JSON.parse(answerText.value);
    await peerConnection.setRemoteDescription(answer);
};

async function setupPeerConnection(isInitiator) {
    peerConnection = new RTCPeerConnection(config);
    
    dataChannel = isInitiator ? peerConnection.createDataChannel("usernameChannel") : null;
    setupDataChannel(isInitiator);

    await startMedia();
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    localVideo.srcObject = localStream;
    peerConnection.ontrack = event => remoteVideo.srcObject = event.streams[0];

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            const desc = JSON.stringify(peerConnection.localDescription);
            offerText.value = desc;
            if (!isInitiator) answerText.value = desc;
        }
    };

    if (isInitiator) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
    } else {
        const offer = JSON.parse(offerText.value);
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
    }
    
    setupAudioAnalysis();
}

async function callFriend(friendId) {
    await setupPeerConnection(true);
    if (dataChannel) {
        dataChannel.onopen = () => {
            dataChannel.send(JSON.stringify({ type: "call", from: myId, to: friendId }));
        };
    }
}

async function startMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
    } catch (e) {
        console.log("Full media failed:", e);
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            console.log("Got audio only");
        } catch (e) {
            console.log("Audio only failed:", e);
            localStream = new MediaStream();
            console.log("No media available, using empty stream");
        }
    }
}

async function updateMediaStream() {
    if (!peerConnection) return;

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    await startMedia();
    localVideo.srcObject = localStream;

    const senders = peerConnection.getSenders();
    localStream.getTracks().forEach(track => {
        const existingSender = senders.find(sender => sender.track && sender.track.kind === track.kind);
        if (existingSender) {
            existingSender.replaceTrack(track);
        } else {
            peerConnection.addTrack(track, localStream);
        }
    });

    setupAudioAnalysis();
}

function setupDataChannel(isInitiator) {
    if (isInitiator) {
        dataChannel.onopen = () => {
            console.log("Data channel opened");
            sendUsernameAndMicState();
        };
    } else {
        peerConnection.ondatachannel = event => {
            dataChannel = event.channel;
            dataChannel.onopen = () => {
                console.log("Data channel opened");
                sendUsernameAndMicState();
            };
            dataChannel.onmessage = handleDataChannelMessage;
        };
    }
    dataChannel.onmessage = handleDataChannelMessage;
}

function handleDataChannelMessage(event) {
    const data = JSON.parse(event.data);
    console.log("Received data:", data);
    if (data.type === "call" && data.to === myId) {
        if (confirm(`${friends[data.from] || "Неизвестный"} (${data.from.slice(0, 8)}...) зовет вас в звонок. Принять?`)) {
            acceptCallBtn.click();
        }
    } else if (data.type === "friendRequest" && data.to === myId) {
        if (confirm(`${data.fromName} (${data.fromId.slice(0, 8)}...) хочет добавить вас в друзья. Добавить?`)) {
            friends[data.fromId] = data.fromName;
            localStorage.setItem("friends", JSON.stringify(friends));
            loadFriends();
            if (dataChannel && dataChannel.readyState === "open") {
                dataChannel.send(JSON.stringify({ type: "friendResponse", fromId: myId, fromName: localUsername, to: data.fromId }));
            }
        }
    } else if (data.type === "friendResponse" && data.to === myId) {
        friends[data.fromId] = data.fromName;
        localStorage.setItem("friends", JSON.stringify(friends));
        loadFriends();
    } else {
        remoteUsernameDisplay.textContent = data.username;
        updateRemoteBorder(data.micState);
    }
}

function sendUsernameAndMicState() {
    const micEnabled = localStream && localStream.getAudioTracks().length > 0 && localStream.getAudioTracks()[0].enabled;
    const micState = micEnabled ? (isAudioActive() ? "active" : "inactive") : "off";
    updateLocalBorder(micState);
    
    if (dataChannel && dataChannel.readyState === "open") {
        const data = { username: localUsername, micState };
        dataChannel.send(JSON.stringify(data));
        console.log("Sent data:", data);
    }
}

function updateLocalBorder(micState) {
    const localWrapper = localVideo.parentElement;
    if (micState === "active") {
        localWrapper.style.borderColor = "#00b4d8";
    } else {
        localWrapper.style.borderColor = "#333";
    }
}

function updateRemoteBorder(micState) {
    const remoteWrapper = remoteVideo.parentElement;
    if (micState === "active") {
        remoteWrapper.style.borderColor = "#00b4d8";
    } else {
        remoteWrapper.style.borderColor = "#333";
    }
}

function setupAudioAnalysis() {
    if (!localStream || localStream.getAudioTracks().length === 0) {
        console.log("No audio track available for analysis");
        return;
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    microphone = audioContext.createMediaStreamSource(localStream);
    microphone.connect(analyser);
    analyser.fftSize = 256;
    console.log("Audio analysis setup complete");
    checkAudioLevel();
}

function isAudioActive() {
    if (!analyser) return false;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    console.log("Audio level:", average);
    return average > 5;
}

function checkAudioLevel() {
    if (localStream && localStream.getAudioTracks().length > 0) {
        sendUsernameAndMicState();
    }
    requestAnimationFrame(checkAudioLevel);
}

copyOfferBtn.onclick = () => {
    navigator.clipboard.writeText(offerText.value).then(() => {
        alert("Код подключения скопирован в буфер обмена!");
    }).catch(err => {
        console.error("Ошибка копирования:", err);
    });
};

toggleMicBtn.onclick = () => {
    if (localStream && localStream.getAudioTracks().length > 0) {
        let audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        toggleMicBtn.classList.toggle("off");
        sendUsernameAndMicState();
        console.log("Mic toggled:", audioTrack.enabled);
    } else {
        console.log("No audio track, updating media...");
        updateMediaStream();
    }
};

toggleCamBtn.onclick = () => {
    if (localStream && localStream.getVideoTracks().length > 0) {
        let videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        toggleCamBtn.classList.toggle("off");
        console.log("Cam toggled:", videoTrack.enabled);
    } else {
        console.log("No video track, updating media...");
        updateMediaStream();
    }
};

toggleManualBtn.onclick = () => {
    if (manualContainer.classList.contains("collapsed")) {
        manualContainer.classList.remove("collapsed");
        manualContainer.classList.add("expanded");
        toggleManualBtn.textContent = "Свернуть ручное подключение";
    } else {
        manualContainer.classList.remove("expanded");
        manualContainer.classList.add("collapsed");
        toggleManualBtn.textContent = "Ручное подключение";
    }
};

document.addEventListener("DOMContentLoaded", () => {
    loadFriends();
    manualContainer.classList.add("collapsed");
});