var system     = require("sdk/system");
var pageMod    = require("sdk/page-mod");
var file       = require("sdk/io/file");
var prefs      = require("sdk/simple-prefs").prefs;
var { Cc, Ci } = require("chrome");

// reminder!
// console.log() doesn't work unless you set extensions.sdk.console.logLevel = all

function LogToFile(rawdata) {
  if (!prefs.allowedHost) {
    throw "WebLogger: You need to select an allowed host for this " +
          "addon via the Addons Manager. Select the addon, and click " +
          "the options button to set a value.";
  }

  if (!prefs.logDir) {
    throw "WebLogger: You need to select a logdir for this addon " +
          "via the Addons Manager. Select the addon, and click the " +
          "options button to set a value.";
  }

  var msg = JSON.parse(rawdata);

  if (msg.origin != prefs.allowedHost) {
    throw "WebLogger: Ignoring request from unallowed host: " + msg.origin;
  }

  var doReboot = false;
  if (Math.random() < (prefs.rebootOdds / 100))
    doReboot = true

  var date = (new Date()).toISOString();
  var filedate = date.replace(/[:\.]/g, "-"); // no colon/period on win32 
  var logpath = prefs.logDir;

  var pathSep = (system.platform == "winnt") ? "\\" : "/";
  if (!logpath.endsWith(pathSep))
      logpath += pathSep;

  var filename = logpath + filedate + ".txt";

  var txtWriter = file.open(filename, "w");
  txtWriter.write("LOG " + date + "\r\n");
  txtWriter.write(msg.data);

  if (doReboot) {
    txtWriter.write("\r\n=== REBOOTING ===\r\n");
    txtWriter.close();
    
    var cmd = Cc["@mozilla.org/file/local;1"]
              .createInstance(Ci.nsILocalFile);
    cmd.initWithPath("C:\\Windows\\System32\\shutdown.exe");

    var proc = Cc["@mozilla.org/process/util;1"]
               .createInstance(Ci.nsIProcess);
    proc.init(cmd);

    var args = ["-t", "5", "-r"];
    proc.run(true, args, args.length);
    system.exit();
  } else {
    txtWriter.close();
  }
}

var pageModScript =
"  document.defaultView.addEventListener('message', function(e) {" +
"    var reqPrefix = 'weblogger:';                      " +
"    var msg = e.data;                                  " +
"    if (!msg.startsWith(reqPrefix)) return;            " +
"    msg = msg.slice(reqPrefix.length);                 " +
"    self.port.emit('LogToFile', JSON.stringify(        " +
"           { data: msg, origin: e.origin }  ));        " +
"  });";


pageMod.PageMod({
  include: ['*'],
  contentScript: pageModScript,
  onAttach: function(worker) {
    worker.port.on("LogToFile", LogToFile);
  }
});
