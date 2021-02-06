var raspi = require('raspi-io').RaspiIO;
var five = require('johnny-five');
var board = new five.Board({io: new raspi()});

// Diagnostics - for switch testing
// sudo node diag.js

var CONFIG = {
    META: {
      runStarted: false
    },
    RELEASE: {
            pin: "GPIO25",
            human_name: "Release",
            startTime: '',
            ctl: {}
    },
    RESET: {
            pin: "GPIO17",
            human_name: "Reset",
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
    HTTP_PORT: 8080
};

board.on("ready", function() {
  parseConfig();

  console.log("Blinking LED");
  CONFIG.LED_INDICATOR.ctl.blink(300);

  CONFIG.RELEASE.ctl.on("up", function() {
      console.log("RELEASE is UP.");
  }).on("down", function(){
      console.log("RELEASE is DOWN.");
  //}).on("hold", function(){
  //    console.log("RELEASE is HELD.");
  });

  CONFIG.RESET.ctl.on("down", function() {
     console.log("RESET is DOWN.");
  }).on("up", function(){
     console.log("RESET is UP.");
  });

  // Setup tracks based on CONFIG
  console.log("Num tracks: ", CONFIG.TRACKS.length);
  for (var i=0; i < CONFIG.TRACKS.length; i++){
     CONFIG.TRACKS[i].ctl.on("change", function() {
        if (this.value === 0)
           console.log("TRACK " + this.id + " is OFF");
        else
           console.log("TRACK " + this.id + " is ON");
     });
  }
});

// Parses configuration and instantiates all relevant track components
function parseConfig() {

    CONFIG.LED_INDICATOR.ctl = new five.Led(CONFIG.LED_INDICATOR.pin);
    CONFIG.RELEASE.ctl = new five.Button({pin: CONFIG.RELEASE.pin, holdtime: 1000});
    CONFIG.RESET.ctl = new five.Button(CONFIG.RESET.pin);

    for (var i = 0; i < CONFIG.TRACKS.length; i++) {
        CONFIG.TRACKS[i].ctl = new five.Sensor({pin: CONFIG.TRACKS[i].pin, type: "digital", id: CONFIG.TRACKS[i].id});
    }

}

// @params state - 1 or 0 for on or off, respectively.
function updateLEDState(state) {
  return state === 0 ? CONFIG.LED_INDICATOR.ctl.off() : CONFIG.LED_INDICATOR.ctl.on();
}
