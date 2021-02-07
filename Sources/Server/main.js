var raspi = require('raspi-io').RaspiIO;
var five = require('johnny-five');
var board = new five.Board({io: new raspi()});
var http = require('http');
var url = require('url');
var moment = require('moment');
var file = require('fs');

var CONFIG = {
    RELEASE: {
            pin: "GPIO25",
            human_name: "Release Mechanism",
            startTime: '',
            ctl: {}
    },
    RESET: {
            pin: "GPIO17",
            human_name: "Reset Button",
            ctl: {}
    },
    LED_INDICATOR: {
            pin: "GPIO4",
            human_name: "LED Indicator",
            ctl: {}
    },
    TRACKS: [
        {
            id: 1,
            pin: "GPIO18",
            human_name: "Lane 1",
            endTime: '',
            computedTimeSeconds: '',
            ctl: {}
        },
        {
            id: 2,
            pin: "GPIO27",
            human_name: "Lane 2",
            endTime: '',
            computedTimeSeconds: '',
            ctl: {}
        },
        {
            id: 3,
            pin: "GPIO22",
            human_name: "Lane 3",
            endTime: '',
            computedTimeSeconds: '',
            ctl: {}
        },
        {
            id: 4,
            pin: "GPIO23",
            human_name: "Lane 4",
            endTime: '',
            computedTimeSeconds: '',
            ctl: {}
        }
    ],
    HTTP_PORT: 8080,
    LANES_IN_USE: 4,
    LANES_COMPLETED: 0,
    RACE_STATUS: "WAIT"
};

board.on("ready", function() {

  // Parse configuration, set LED to solid green to indicate that track is ready.
  parseConfig();

  // Monitor events from track release mechanism
  CONFIG.RELEASE.ctl.on("up", function() {
    // Only record start time if no start time has yet been written.
    if(CONFIG.RELEASE.startTime === ""){ // Never overwrite existing start times
      CONFIG.RELEASE.startTime = Date.now(); // Record time
      CONFIG.LED_INDICATOR.ctl.blink(500); // Blink until reset
      CONFIG.RACE_STATUS = "RACING";
      console.log("Race started!");
    }
  });

  // Resets track state (clears all records)
  // Will also blink light to indicate that the track has been reset.
  CONFIG.RESET.ctl.on("down", function() {
    resetState();
  }).on("up", function(){
    updateLEDState(0);
  });

  // Setup tracks based on CONFIG
  // Only records end time if one hasn't been recorded yet
  // Will maintain first recorded time until track is reset to prevent accidental overwrites.
  console.log("Num tracks configured: ", CONFIG.TRACKS.length);
  for (var i=0; i < CONFIG.TRACKS.length; i++){
     CONFIG.TRACKS[i].ctl.on("change", function() {
	if (this.value === 0) 
           setLaneCompleted(this.id);
     });
  }

  console.log("Num lanes in use: ", CONFIG.LANES_IN_USE);

  resetState();

});

http.createServer(function(req, res) {

    if (req.method === "GET") {
        var call = url.parse(req.url, true);

        // allow any origin to make API calls.
        res.setHeader('Access-Control-Allow-Origin', '*');

        processRequest(call.pathname, call.query, req, res);

    } else {
        res.writeHead(400);
        res.end(JSON.stringify({
            error: "method not implemented"
        }));
    }
}.bind({
    CONFIG: CONFIG
})).listen(CONFIG.HTTP_PORT);

function processRequest(method, params, req, res) {

    switch (method) {
        case "/get/state": // Retrieve track/application state
            res.writeHead(200);
            res.end(JSON.stringify(getState(CONFIG)));
            break;

        case "/get/prevstate": //Retrieve previous state from file log
            res.writeHead(200);
            res.end(getLastLogLine());
            break;

        case "/set/led": // Manually toggle LED state
            res.writeHead(200);
            res.end(JSON.stringify({
                command_sent: true
            }));
            CONFIG.LED_INDICATOR.ctl.toggle();
            break;

        case "/set/reset": // Soft reset button (in addition to physical one)
            res.writeHead(200);
            res.end(JSON.stringify({
                command_sent: true
            }));
            resetState();

            if (params.lanes) {
               CONFIG.LANES_IN_USE = params.lanes;
               console.log("Changed LANES_IN_USE to " + CONFIG.LANES_IN_USE);
            }

            break;

        default: // Unhandled API method
            res.writeHead(400);
            res.end(JSON.stringify({
                error: "method not implemented"
            }));
    }

}

// Parses configuration and instantiates all relevant track components
function parseConfig() {

    CONFIG.LED_INDICATOR.ctl = new five.Led(CONFIG.LED_INDICATOR.pin);
    CONFIG.RELEASE.ctl = new five.Button({pin: CONFIG.RELEASE.pin, holdtime: 1000});
    CONFIG.RESET.ctl = new five.Button(CONFIG.RESET.pin);

    for (var i = 0; i < CONFIG.TRACKS.length; i++) {
        CONFIG.TRACKS[i].ctl = new five.Sensor({pin: CONFIG.TRACKS[i].pin, type: "digital", id: CONFIG.TRACKS[i].id});
    }

}

// Reads application state and removes j5 related properties.
function getState(config) {
    var state = {};

    state.RACE_STATUS = config.RACE_STATUS;
    state.START_TIME = config.RELEASE.startTime;

    state.TRACKS = [];
    for (var i = 0; i < config.TRACKS.length; i++) {
        var newCar = {
           "Lane": config.TRACKS[i].id,
           "endTime": config.TRACKS[i].endTime,
           "elapsedTime": config.TRACKS[i].computedTimeSeconds
        }
        state.TRACKS[i] = newCar;
    }

    return state;
}

//Reads in last line of log file
function getLastLogLine() {
   var response = "{}";

   //if file exists, get last line containing a RACE_STATUS
   if(file.existsSync("pwd.log")) {
      response = require("child_process").execSync("grep RACE_STATUS pwd.log | tail -1").toString();
      if (response.includes(" - "))
         response = response.split(" - ")[1];
   }

   return response;
}

// Reset all recorded and computed times, for all tracks
function resetState(){
  CONFIG.RELEASE.startTime = '';
  for (var i = 0; i < CONFIG.TRACKS.length; i++) {
    CONFIG.TRACKS[i].endTime = '';
    CONFIG.TRACKS[i].computedTimeSeconds = '';
  }
  CONFIG.RACE_STATUS = "WAIT";
  CONFIG.LANES_COMPLETED = 0;

  updateLEDState(1);

  writelog("RESET LANES=" + CONFIG.LANES_IN_USE);

  console.log("Waiting to start");
}

//Set number of lanes complete and status of race
function setLaneCompleted(lane){
    var i = lane-1;
    if(CONFIG.TRACKS[i].endTime === ""){
       CONFIG.TRACKS[i].endTime = Date.now();
       CONFIG.TRACKS[i].computedTimeSeconds = computeElapsedTime(CONFIG.RELEASE.startTime, CONFIG.TRACKS[i].endTime);
       CONFIG.LANES_COMPLETED += 1;
       console.log("Lane " + lane + " finished");
    }

    //check if last lane then end race
    if (CONFIG.LANES_IN_USE == CONFIG.LANES_COMPLETED && CONFIG.RACE_STATUS != "COMPLETE") {
       CONFIG.RACE_STATUS = "COMPLETE";
       CONFIG.LED_INDICATOR.ctl.stop(); //stop blinking
       updateLEDState(0);
       console.log("Race Complete");

       //write results to log
       writelog(JSON.stringify(getState(CONFIG)));
    }
}

// @params startTime - initial time at which car was released
// @params endTime - time at which car reached the end of the track
function computeElapsedTime(startTime, endTime){
  return ((endTime-startTime)/1000);
}

// @params state - 1 or 0 for on or off, respectively.
function updateLEDState(state) {
  return state === 1 ? CONFIG.LED_INDICATOR.ctl.off() : CONFIG.LED_INDICATOR.ctl.on();
}

function writelog (message) {
  file.appendFile("pwd.log", moment().format('MM-DD-YYYY hh:mm:ss') + " - " + message + "\n", (err) => {
     if (err) throw err;
  });
}

// Blink LED indicator rapidly (every 100ms) on uncaught exceptions.
process.on('uncaughtException', function() {
  CONFIG.LED_INDICATOR.ctl.blink(100);
});
