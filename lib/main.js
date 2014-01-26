var system     = require("sdk/system");
var pageMod    = require("sdk/page-mod");
var file       = require("sdk/io/file");
var prefs      = require("sdk/simple-prefs").prefs;
const { Cc, Ci, Cu } = require("chrome");

// reminder!
// 1) console.log() doesn't work unless you set extensions.sdk.console.logLevel = all
// 2) Seems sometimes (?) not having this set will cause exceptions to print to
//    stdout/stderr but not in the browser console. Or the console but not stdout.
// 3) Logging from the browser's startup page sometimes fails to work
//    entirely, we don't even get the message. Reloading page fixes it. Seen
//    with testcase but not memtest. Weird.

function LogCommand(rawdata) {

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

  if (msg.origin != prefs.allowedHost && prefs.allowedHost != '*') {
    throw "WebLogger: Ignoring request from unallowed host: " + msg.origin;
  }

  if (msg.data == "") {
    throw "WebLogger: Ignoring request with empty message.";
  }

  switch (msg.command) {
    case "reboot":
      if (!isWindows)
        throw "Weblogger: Dang. No reboots on not-Windows.";

      var cmd = Cc["@mozilla.org/file/local;1"]
                .createInstance(Ci.nsILocalFile);
      cmd.initWithPath("C:\\Windows\\System32\\shutdown.exe");

      var proc = Cc["@mozilla.org/process/util;1"]
                 .createInstance(Ci.nsIProcess);
      proc.init(cmd);

      var args = ["-t", "5", "-r"];
      proc.run(true, args, args.length);
      system.exit();
      break;

    case "append":
      appendTextLine(msg.data);
      break;

    case "unique":
      logUniqueFile(msg.data);
      break;

    default:
      throw "Weblogger: Ignoring unknown command (" + msg.command + ")";
      break;
  }
}

function logUniqueFile(msg) {
  var date = (new Date()).toISOString();
  var filedate = date.replace(/[:\.]/g, "-"); // no colon/period on win32
  var logpath = prefs.logDir;

  var pathSep = isWindows ? "\\" : "/";
  if (!logpath.endsWith(pathSep))
      logpath += pathSep;

  var filename = logpath + filedate + ".txt";

  var txtWriter = file.open(filename, "w");
  //txtWriter.write("LOG " + date + (isWindows ? "\r\n" : "\n"));
  txtWriter.write(msg + (isWindows ? "\r\n" : "\n"));
  txtWriter.close();
}


function appendTextLine(line) {
  function writeLine(data) {
    data = utfConverter.ConvertFromUnicode(data);
    data += utfConverter.Finish();
    data += (isWindows ? "\r\n" : "\n");
    stream.write(data, data.length);
  }

  utfConverter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
                 createInstance(Ci.nsIScriptableUnicodeConverter);
  utfConverter.charset = "UTF-8";

  var file = Cc["@mozilla.org/file/local;1"].
             createInstance(Ci.nsILocalFile);

  var logpath = prefs.logDir;
  var pathSep = isWindows ? "\\" : "/";
  if (!logpath.endsWith(pathSep))
      logpath += pathSep;
  var filename = logpath + "weblogger.txt";

  file.initWithPath(filename);

  var stream = Cc["@mozilla.org/network/file-output-stream;1"].
               createInstance(Ci.nsIFileOutputStream);
  var flags = 0x02 | 0x08 | 0x10; // WRONLY | CREAT | APPEND
  // 0x20 = TRUNC
  var perm = 0644;

  stream.init(file, flags, perm, 0);
  writeLine(line);
  stream.close();
}

var isWindows = (system.platform == "winnt");

var pageModScript =
"  document.defaultView.addEventListener('message', function(e) {" +
"    var found = e.data.match(/^weblogger-(.+):(.*)$/);         " +
"    if (!found) { throw 'WebLogger: Got invalid request'; }     " +
"    self.port.emit('LogCommand', JSON.stringify(                " +
"           { command: found[1], data: found[2], origin: e.origin }  )); " +
"  });";


pageMod.PageMod({
  include: ['*'],
  contentScript: pageModScript,
  onAttach: function(worker) {
    worker.port.on("LogCommand", LogCommand);
  }
});

console.log("WebLogger loaded.");
