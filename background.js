var g_interestedInFeatures = [
  "game_flow",
  "summoner_info",
  "champ_select",
  "lcu_info",
  "lobby_info",
  "end_game",
  "game_info"
];

const
  PROTOCOL = 'https', // replace with 'http' when running a local server
  WS_PROTOCOL = 'wss', // replace with 'ws' when running a local server
  HOST = 'oauth.sididi.tv', // replace with 'localhost:3001' when running a local server
  API_URL = `${PROTOCOL}://${HOST}/twitch`,
  WS_URL = `${WS_PROTOCOL}://${HOST}/twitch`;

let
  //buttons
  loginButton = null,
  logoutButton = null,
  createPredictionButton = null,
  winPredictionButton = null,
  losePredictionButton = null,
  cancelPredictionButton = null,
  //prog vars
  prediction = null,
  sessionId = null,
  socketConnection = null;

var onErrorListener,onInfoUpdates2Listener,	onNewEventsListener;

function registerEvents() {

  onErrorListener = function(info) {
    console.log("Error: " + JSON.stringify(info));
  }
  
  onInfoUpdates2Listener = async function(info) {
    console.log("Info UPDATE: " + JSON.stringify(info));
    if (!prediction && info.feature === "champ_select") {
      let raw = JSON.parse(info.info.champ_select.raw);
      if (raw.timer.phase === "GAME_STARTING" && !raw.isCustomGame) {
        console.log("PREDICTION STARTING");
        const streamInfo = await getStreamInfo();
        if (streamInfo && streamInfo.type == "live") {
          createPrediction();
        }
      }
    } else if (prediction && info.feature === "end_game") {
      let raw = JSON.parse(info.info.end_game_lol.lol_end_game_stats);
      let i = raw.teams[0].isPlayerTeam ? 0 : 1;
      if (raw.gameEndedInEarlySurrender && raw.gameLength <= 210 && raw.gameLength >= 90) { // check if remake
        console.log("PREDICTION CANCELED (remake)");
        cancelPrediction();
      } else { // otherwise validate prediction
        console.log("PREDICTION VALIDATED - WinningTeam = " + raw.teams[i].isWinningTeam);
        endPrediction(raw.teams[i].isWinningTeam);
      }
    }
  }
  
  onNewEventsListener = function(info) {
    console.log("EVENT FIRED: " + JSON.stringify(info));
  }

  // general events errors
  overwolf.games.events.onError.addListener(onErrorListener);
  
  // "static" data changed (total kills, username, steam-id)
  // This will also be triggered the first time we register
  // for events and will contain all the current information
  overwolf.games.launchers.events.onInfoUpdates.addListener(onInfoUpdates2Listener);									
  // an event triggerd
  overwolf.games.events.onNewEvents.addListener(onNewEventsListener);
}

function unregisterEvents() {
  overwolf.games.events.onError.removeListener(onErrorListener);
  overwolf.games.events.onInfoUpdates2.removeListener(onInfoUpdates2Listener);
  overwolf.games.events.onNewEvents.removeListener(onNewEventsListener);
}

async function startApp() {
  if (localStorage.sessionId) {
    sessionId = await decrypt(localStorage.sessionId);
  } else {
    sessionId = null;
  }

  console.log(sessionId);
  console.log(localStorage);

  window.login = login;
  window.logout = logout;
  window.getUser = getUser;
  window.getChannel = getChannel;
  window.openConsole = openConsole;
  window.createPrediction = createPrediction;
  window.endPrediction = endPrediction;
  window.cancelPrediction = cancelPrediction;
  window.initLoginButtons = initLoginButtons;

  overwolf.extensions.onAppLaunchTriggered.addListener(openMainWindow);
  
  // Start here
  overwolf.games.launchers.onLaunched.addListener(function() {
    // registerEvents();
    // setTimeout(setFeatures, 1000);
    console.log("onLaunched fired");
  });

  overwolf.games.launchers.getRunningLaunchersInfo(function(res) {
    if (launcherRunning(res)) {
      unregisterEvents();
      registerEvents();
      setTimeout(setFeatures, 1000);
    }
    console.log("getRunningLaunchersInfo: " + JSON.stringify(res));
  });

  overwolf.games.launchers.onTerminated.addListener(function(res) {
    console.log("onTerminated fired");
    //setTimeout(window.close, 1000);
  });

  /* Check if twitch token is still valid & reconnects if needed */
  if (sessionId) {
    var user = await getUser();
  }
  if (sessionId == null || user == null || (user != null && !user.login)) {
    await logout(); // resets sessionid if it expired
    await login(); // logins through normal browser
  }

  /* tray */
  const trayMenu = {
    "menu_items": [{
          "label": "Ouvrir le dashboard",
          "id": "open_window"
        },
        {
          "label": "Quitter",
          "id": "close_window"
        }
    ]
  }

  overwolf.os.tray.setMenu(trayMenu, (res) => {
      console.log("setMenu -> res", res) 
  });

  overwolf.os.tray.onTrayIconClicked.addListener((event) => {
    openMainWindow();
  })

  overwolf.os.tray.onMenuItemClicked.addListener((event) => {
    if (event.item === "open_window") {
      openMainWindow();
    } else if (event.item === "close_window") {
      window.close();
    }
  })

  //openMainWindow(); // uncomment if debug is needed / dev mode
}

function launcherRunning(launcherInfo) {
  if (!launcherInfo) {
    return false;
  }

  if (!launcherInfo.launchers[0]) {
    return false;
  }

  // NOTE: we divide by 10 to get the launcher class id without it's sequence number
  if (Math.floor(launcherInfo.launchers[0].id / 10) != 10902) {
    return false;
  }

  console.log("League of Legends launcher running");
  return true;
}

function setFeatures() {
  overwolf.games.launchers.events.setRequiredFeatures(
    10902,
    g_interestedInFeatures,
    function(info) {
      if (info.status == "error") {
        //console.log("Could not set required features: " + info.reason);
        //console.log("Trying in 2 seconds");
        window.setTimeout(setFeatures, 2000);
        return;
      }

      console.log("Set required features:");
      console.log(JSON.stringify(info));
    }
  );
}

// 1. First make a websocket connection to server
// 2. The server sends a Session ID token that will identify this client when it
//    makes HTTP requests
// 3. The Session ID is saved in LocalStorage in an encrypted format
// 4. Login URL is opened in the browser with the identifying Session ID token
//    sent as argument
// 5. When the user logs in in their browser the server sends a Websocket
//    message with their Twitch user info. Now the user is logged in, and can make
//    authenticated requests like get-user/ (getUser() function)
async function login() {
  if (sessionId) {
    console.log('login(): please log out before logging in again');
    return;
  }

  try {
    sessionId = await connectWebsocket();
    localStorage.sessionId = await encrypt(sessionId);

    overwolf.utils.openUrlInDefaultBrowser(
      `${API_URL}/auth/?sessionId=${sessionId}`,
      { skip_in_game_notification: true }
    );
  } catch(e) {
    console.warn('login(): error:', e);
    sessionId = null;
    localStorage.removeItem('sessionId');
    openMainWindow();
  }
}

// Call the logout endpoint on the server, and remove the session token in this client
async function logout() {
  if (!sessionId) {
    console.log('logout(): you are not logged in');
    return;
  }

  try {
    await fetch(`${API_URL}/logout/?sessionId=${sessionId}`);
  } catch(e) {
    console.warn('logout(): error:', e);
  }

  sessionId = null;
  localStorage.removeItem('sessionId');

  console.log('logout(): logged out');
  disableLoginButton(false)
}

async function getUser() {
  if (!sessionId) {
    console.log('getUser(): no sessionId, please log in');
    return null;
  }

  console.log('getUser(): getting Twitch user');

  const response = await fetch(`${API_URL}/get-user/?sessionId=${sessionId}`);

  if (response.status === 404) {
    console.log('getUser(): user not found, please log in again', response);
    return null;
  } else if (response.status === 401) {
    console.log('getUser(): not logged in', response);
    return null;
  } else if (!response.ok) {
    console.log('getUser(): error in response:', response);
    return null;
  }

  const parsedResponse = await response.json();

  console.log('getUser():', parsedResponse);
  return parsedResponse;
}

async function getStreamInfo() {
  if (!sessionId) {
    console.log('getStreamInfo(): no sessionId, please log in');
    return null;
  }

  console.log('getStreamInfo(): getting stream informations');

  const response = await fetch(`${API_URL}/stream-info/?sessionId=${sessionId}`);

  if (response.status === 404) {
    console.log('getStreamInfo(): user not found, please log in again', response);
    return null;
  } else if (response.status === 401) {
    console.log('getStreamInfo(): not logged in', response);
    return null;
  } else if (!response.ok) {
    console.log('getStreamInfo(): error in response:', response);
    return null;
  }

  const parsedResponse = await response.json();

  console.log('getStreamInfo():', parsedResponse);
  return parsedResponse;
}

async function getChannel() {
  if (!sessionId) {
    console.log('getChannel(): no sessionId, please log in');
    return;
  }

  console.log('getChannel(): getting Twitch channel');

  const response = await fetch(`${API_URL}/get-channel/?sessionId=${sessionId}`);

  if (response.status === 404) {
    console.log('getChannel(): user not found, please log in again', response);
    return;
  } else if (response.status === 401) {
    console.log('getChannel(): not logged in', response);
    return;
  } else if (!response.ok) {
    console.log('getChannel(): error in response:', response);
    return;
  }

  const parsedResponse = await response.json();

  console.log('getChannel():', parsedResponse);
}

async function createPrediction() {
  if (!sessionId) {
    console.log('createPrediction(): no sessionId, please log in');
    return null;
  }

  console.log('createPrediction(): veryfing if user is online');
  // check si erreur request ou que pas en ligne

  console.log('createPrediction(): creating Twitch prediction');

  const response = await fetch(`${API_URL}/create-prediction/?sessionId=${sessionId}`);

  if (response.status === 404) {
    console.log('createPrediction(): user not found, please log in again', response);
    return null;
  } else if (response.status === 401) {
    console.log('createPrediction(): not logged in', response);
    return null;
  } else if (!response.ok) {
    console.log('createPrediction(): error in response:', response);
    return null;
  }

  const parsedResponse = await response.json();

  console.log('createPrediction():', parsedResponse);

  prediction = parsedResponse;
  disablePredictionButtons(false);
  return parsedResponse;
}

async function endPrediction(isWinning) {
  if (!sessionId) {
    console.log('endPrediction(): no sessionId, please log in');
    return;
  } else if (!prediction) {
    console.log('endPrediction(): no prediction is running, can\'t end prediction');
    return;
  }

  console.log('endPrediction(): ending Twitch prediction');

  const predictionResult = isWinning
    ? (prediction.outcomes[0].title === "Oui" ? prediction.outcomes[0].id : prediction.outcomes[1].id)
    : (prediction.outcomes[0].title === "Oui" ? prediction.outcomes[1].id : prediction.outcomes[0].id);
  const response = await fetch(`${API_URL}/end-prediction/?sessionId=${sessionId}&predictionId=${prediction.id}&predictionResult=${predictionResult}`);

  if (response.status === 404) {
    console.log('endPrediction(): user not found, please log in again', response);
    return;
  } else if (response.status === 401) {
    console.log('endPrediction(): not logged in', response);
    return;
  } else if (!response.ok) {
    console.log('endPrediction(): error in response:', response);
    return;
  }

  const parsedResponse = await response.json();

  console.log('endPrediction():', parsedResponse);
  prediction = null;
  disablePredictionButtons(true);
}

async function cancelPrediction() {
  if (!sessionId) {
    console.log('cancelPrediction(): no sessionId, please log in');
    return;
  } else if (!prediction) {
    console.log('cancelPrediction(): no prediction is running, can\'t end prediction');
    return;
  }

  console.log('cancelPrediction(): canceling Twitch prediction');

  const response = await fetch(`${API_URL}/cancel-prediction/?sessionId=${sessionId}&predictionId=${prediction.id}`);

  if (response.status === 404) {
    console.log('cancelPrediction(): user not found, please log in again', response);
    //await logout();
    return;
  } else if (response.status === 401) {
    console.log('cancelPrediction(): not logged in', response);
    return;
  } else if (!response.ok) {
    console.log('cancelPrediction(): error in response:', response);
    return;
  }

  const parsedResponse = await response.json();

  console.log('cancelPrediction():', parsedResponse);
  prediction = null;
  disablePredictionButtons(true);
}

function connectWebsocket() { return new Promise((resolve, reject) => {
  if (socketConnection) {
    socketConnection.close();
    socketConnection = null;
  }

  socketConnection = new WebSocket(WS_URL);

  socketConnection.addEventListener('open', () => {
    console.log('connectWebsocket(): socket connected successfully');
  });

  socketConnection.addEventListener('close', () => {
    console.log('connectWebsocket(): socket closed');
  });

  socketConnection.addEventListener('error', e => {
    console.error(e);
    reject(e);
  });

  socketConnection.addEventListener('message', e => {
    console.log('connectWebsocket(): socket message:', e?.data);

    if (!e?.data) {
      return;
    }

    try {
      const message = JSON.parse(e.data);

      switch (message?.messageType) {
        // This promise is resolved with a session token when the server connects
        case 'sessionId':
          console.log('connectWebsocket(): got sessionId from websocket:', message.sessionId);
          resolve(message.sessionId);
        break;
        // Logged in successfully, we got the user, we can close the websocket connection now
        case 'login':
          console.log('connectWebsocket(): logged in as user', message.user);
          disableLoginButton(true);
          disablePredictionButtons(true);
          socketConnection.close();
        break;
      }
    } catch (err) {
      console.warn('connectWebsocket(): could not parse websocket message:', e, err);
    }
  });

  setTimeout(
    () => reject('connectWebsocket(): websocket connection timed out'),
    5000
  );
})}

// Encrypt the session token for safe storage
function encrypt(string) { return new Promise((resolve, reject) => {
  overwolf.cryptography.encryptForCurrentUser(string, results => {
    if (results && results.success && results.ciphertext) {
      resolve(results.ciphertext);
    } else {
      reject(results);
    }
  });
})}

// Decrypt the session token
function decrypt(string) { return new Promise((resolve, reject) => {
  overwolf.cryptography.decryptForCurrentUser(string, results => {
    if (results && results.success && results.plaintext) {
      resolve(results.plaintext);
    } else {
      reject(results);
    }
  });
})}

// Opens the developer console
// PLEASE NOTE: It's not advised to use this method in production apps
function openConsole() {
  overwolfInternal.extensions.showDevTools(location.hostname, 'background');
}

function initLoginButtons(button1, button2, button3, button4, button5, button6) {
  loginButton = button1;
  logoutButton = button2;
  createPredictionButton = button3;
  winPredictionButton = button4;
  losePredictionButton = button5;
  cancelPredictionButton = button6;
}

// Opens the UI window
function openMainWindow() {
  overwolf.windows.obtainDeclaredWindow('main', async (result) => {
    if (result.success && result.window && result.window.id) {
      await overwolf.windows.restore(result.window.id, null);
      while (!loginButton && !logoutButton) {
        await new Promise(r => setTimeout(r, 200));
      }
      disableLoginButton(sessionId != null);
      disablePredictionButtons(true);
    }
  });

}

function disableLoginButton(condition)
{
  if (loginButton && logoutButton) {
    if (condition) {
      logoutButton.removeAttribute('disabled');
      loginButton.setAttribute('disabled', '');
    } else {
      loginButton.removeAttribute('disabled');
      logoutButton.setAttribute('disabled', '');
    }
  }
}

function disablePredictionButtons(condition)
{
  if (winPredictionButton && losePredictionButton && cancelPredictionButton && createPredictionButton) {
    if (condition) {
      winPredictionButton.setAttribute('disabled', '');
      losePredictionButton.setAttribute('disabled', '');
      cancelPredictionButton.setAttribute('disabled', '');
      createPredictionButton.removeAttribute('disabled');
    } else {
      winPredictionButton.removeAttribute('disabled');
      losePredictionButton.removeAttribute('disabled');
      cancelPredictionButton.removeAttribute('disabled');
      createPredictionButton.setAttribute('disabled', '');
    }
  }
}

startApp().catch(console.error);
