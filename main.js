document.getElementById('login').addEventListener('click', () => {
  const backgroundController = overwolf.windows.getMainWindow();

  backgroundController.login();
});

document.getElementById('logout').addEventListener('click', () => {
  const backgroundController = overwolf.windows.getMainWindow();

  backgroundController.logout();
});

// document.getElementById('getUser').addEventListener('click', () => {
//   const backgroundController = overwolf.windows.getMainWindow();

//   backgroundController.getUser();
// });

// document.getElementById('getChannel').addEventListener('click', () => {
//   const backgroundController = overwolf.windows.getMainWindow();

//   backgroundController.getChannel();
// });

// document.getElementById('openConsole').addEventListener('click', () => {
//   const backgroundController = overwolf.windows.getMainWindow();

//   backgroundController.openConsole();
// });

document.getElementById('createPrediction').addEventListener('click', () => {
  const backgroundController = overwolf.windows.getMainWindow();
  console.log(backgroundController)

  backgroundController.createPrediction();
});

document.getElementById('endPredictionWin').addEventListener('click', () => {
  const backgroundController = overwolf.windows.getMainWindow();

  backgroundController.endPrediction(true);
});

document.getElementById('endPredictionLose').addEventListener('click', () => {
  const backgroundController = overwolf.windows.getMainWindow();

  backgroundController.endPrediction(false);
});

document.getElementById('cancelPrediction').addEventListener('click', () => {
  const backgroundController = overwolf.windows.getMainWindow();

  backgroundController.cancelPrediction();
});

const backgroundController = overwolf.windows.getMainWindow();
backgroundController.initLoginButtons(
  document.getElementById('login'),
  document.getElementById('logout'),
  document.getElementById('createPrediction'),
  document.getElementById('endPredictionWin'),
  document.getElementById('endPredictionLose'),
  document.getElementById('cancelPrediction'),
  );