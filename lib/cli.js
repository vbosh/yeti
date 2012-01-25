"use strict";

var nopt = require("nopt");
var tty = require("tty");
var os = require("os");
var meta = require("./package").readPackageSync();

var Hub = require("./hub");
var color = require("./old/color").codes;

var batch = require("./batch");

var good = "✔";
var bad = "✖";

var isTTY = process.stderr.isTTY;

function error() {
    var args = Array.prototype.slice.apply(arguments);
    console.error.apply(console, args);
}

function panic() {
    var args = Array.prototype.slice.apply(arguments);
    error.apply(panic, args);
    process.exit(1);
}

function puts() {
    var args = Array.prototype.slice.apply(arguments);
    console.log.apply(console, args);
}

function setupProcess() {
    process.on("uncaughtException", function (err) {
        var message;

        if ("string" !== typeof err) {
            err = err.stack;
        }

        if (isTTY) {
            message = [
                color.red(bad + " Whoops!") + " " + err, "",
                "If you believe this is a bug in Yeti, please report it.",
                "    " + color.bold(meta.bugs.url),
                "    Yeti v" + meta.version,
                "    Node.js " + process.version
            ];
        } else {
            message = [
                "Yeti v" + meta.version + " " +
                    "(Node.js " + process.version +
                    ") Error: " + err,
                "Report this bug at " + meta.bugs.url
            ];
        }

        panic(message.join("\n"));
    });
}

function parseArgv(argv) {
    var knownOptions = {
        "server": Boolean,
        "version": Boolean,
        "debug": Boolean,
        "port": Number,
        "help" : Boolean
    }, shortHands = {
        "s": ["--server"],
        "d": ["--debug"],
        "p": ["--port"],
        "v": ["--version"]
    };

    // These should be exports, use a different file.

    return nopt(knownOptions, shortHands, argv);
}

function submitBatch(hub, tests) {
    error("Starting test.");
    var b = batch.createBatch({
        hub: {
            port: 9000,
            hostname: "localhost"
        },
        port: 9090,
        basedir: __dirname,
        tests: tests
    });

    b.on("results", function (res) {
        error("Results:", res);
    });
}

function runBatch(options) {
    var files = options.argv.remain,
        hostname = os.hostname(),
        port = options.port || 9000,
        debug = options.debug;
    //error("Looks like you'd like to run some files: " + files.join(", "));
    //error("Not implemented yet.");

    // TODO Connect to a Hub.

    // For now, just create a hub.

    if (!isTTY) {
        // stderr is not a terminal, we are likely being ran by another program.
        // Fail quickly instead of waiting for browsers.
        throw "Unable to connect to Hub or start an interactive session.";
        // TODO: Allow waiting X seconds for browsers.
        //        "Try running with --wait 30 to wait 30 seconds for browsers to connect.";
    }

    var hub = new Hub({
        log: {
            console: {
                silent: !debug
            },
            logAll: true
        }
    });
    hub.listen(port);

    // In this case, nobody is connected yet.
    // If we connected to a server, we would list
    // the current agents.
    /*
    function showAgents() {
        hub.getAgents().forEach(function (agent) {
            error("Connected:", agent.getName());
            error("Press Enter to begin testing.");
        });
    }
    */

    process.stdin.resume();
    tty.setRawMode(true);

    process.stdin.on("keypress", function (s, key) {
        if (key.ctrl) {
            switch (key.name) {
                case "c":
                    process.kill(process.pid, "SIGINT");
                    break;
                case "z":
                    process.kill(process.pid, "SIGSTP");
                    break;
            }
        } else if (key.name !== "enter")  {
            error("Press Enter to begin testing, or Ctrl-C to exit.");
        } else {
            tty.setRawMode(false);
            process.stdin.pause();
            submitBatch(hub, files);
        }
        //panic("Got input", s, key);
    });

    error("Waiting for agents to connect at http://localhost:" + port + ".");
    error("When ready, press Enter to begin testing.");

    hub.on("agentConnect", function (agent) {
        error("Connected:", agent.getName());
    });

    hub.on("agentDisconnect", function (agent) {
        error("Disconnected:", agent.getName());
//        showAgents();
    });

    // One of two things will happen RIGHT NOW
    //
    // We will try to connect to a Hub on options.host and options.port
    // (or options.url?) -- default localhost 8090...
    //
    // If that succeeds, we will submit a batch to that
    // Hub, via HTTP, then use the created ID returned
    // to begin a socket.io session with the Hub to listen
    // for test data.
    //
    // If that fails, we will create a Hub in this
    // proess and submit a batch to that using the Hub API.
    //
    // We then will directly subscribe to the Hub's Batch events.
    //
    // VERY IMPORTANT: In both modes, we begin testing IMMEDIATELY
    // unless no browsers are connected to the Hub.
    //
    // If no browsers are connected, we will create a batch
    // but will intrepret the response's data to determine
    // if we need to wait. This may be a 5xx code.
    //
    // If we need to wait, we will subscribe
    // to a different socket.io namespace / local event that
    // notifies us what browsers are connected for the batch.
    //
    // When we press Enter, we will send the batch request again.
    //
    // NOTE: For this version, we will use all available browsers
    // connected to the Hub.
}

function startServer(options) {
    var server = new Hub({
        log: {
            console: {
                silent: !options.debug
            }
        }
    });
    server.listen(8090, function () {
        error("Yeti Hub listening on port 8090.");
    });
}

exports.route = function (argv) {
    setupProcess();

    var options = parseArgv(argv),
        usage = "usage: " + argv[1] +
                " [--version | -v] [--server | -s] [--port=<n>]" +
                " [--help] [--] [<HTML files>]";

    if (options.argv.remain.length) {
        if (options.server) {
            error("Ignoring --server option.");
        }
        runBatch(options);
    } else if (options.server) {
        startServer(options);
    } else if (options.version) {
        puts(meta.version);
    } else if (options.help) {
        puts(usage);
    } else {
        panic(
            usage + "\n" +
                "No files specified. " +
                "To launch the Yeti server, specify --server."
        );
    }
};