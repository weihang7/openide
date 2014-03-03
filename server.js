#!/usr/bin/env node
var express     = require('express');
var fs          = require('fs');
var cluster     = require('cluster');
var numCPUs = require('os').cpus().length;
var kue         = require('kue');
var jobs        = kue.createQueue();
var hat         = require('hat');
var rack        = hat.rack();
var sharejs     = require('share');
var livedb      = require('livedb');
var livedbMongo = require('livedb-mongo');
var backend     = livedb.client(livedbMongo('127.0.0.1:27017/app', {
  safe: true
}));
var share       = sharejs.server.createClient({
  backend: backend
});
var browserChannel = require('browserchannel').server;
var Duplex      = require('stream').Duplex;
var exec        = require('child_process').exec;
var execFile    = require('child_process').execFile;
var mongoclient = require('mongodb').MongoClient;

if (cluster.isMaster) {

  // Fork workers.
  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  /**
   *  Define the application.
   */
  var App = function() {

  //  Scope.
  var self = this;


  /*  ================================================================  */
  /*  Helper functions.                                                 */
  /*  ================================================================  */

  /**
   *  Set up server IP address and port # using env variables/defaults.
   */
  self.setupVariables = function() {
    self.port      = 80;
  };


  /**
   *  terminator === the termination handler
   *  Terminate server on receipt of the specified signal.
   *  @param {string} sig  Signal to terminate on.
   */
  self.terminator = function(sig){
    if (typeof sig === "string") {
      console.log('%s: Received %s - terminating app ...',
          Date(Date.now()), sig);
      process.exit(1);
    }
    console.log('%s: Node server stopped.', Date(Date.now()) );
  };


  /**
   *  Setup termination handlers (for exit and a list of signals).
   */
  self.setupTerminationHandlers = function(){
    //  Process on exit and signals.
    process.on('exit', function() { self.terminator(); });

    // Removed 'SIGPIPE' from the list - bugz 852598.
    ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
      'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
    ].forEach(function(element, index, array) {
      process.on(element, function() { self.terminator(element); });
    });
  };


  /*  ================================================================  */
  /*  App server functions (main app logic here).                       */
  /*  ================================================================  */

  /**
   *  Create the routing table entries + handlers for the application.
   */
  self.createRoutes = function() {
    self.routes = {};

    self.routes['/'] = function(req, res) {
      var uuid;
      uuid = rack();
      res.writeHead(303, {location: '/openide.html#' + uuid});
      res.send();
    };
  };


  /**
   *  Initialize the server (express) and create the routes and register
   *  the handlers.
   */
  self.initializeServer = function() {
    self.createRoutes();
    self.app = express();

    //  Add handlers for the app (from the routes).
    for (var r in self.routes) {
      self.app.get(r, self.routes[r]);
    }

    self.app.use('/queue', kue.app);
    self.app.use(express.compress());

    self.app.use(express.static(sharejs.scriptsDir));
    self.app.use(browserChannel({
      webserver: self.app
    }, function (client) {
      var stream;
      stream = new Duplex({
        objectMode: true
      });
      stream._write = function (chunk, encoding, callback) {
        if (client.state !== 'closed') {
          client.send(chunk);
        }
        return callback();
      };
      stream._read = function() {};
      stream.headers = client.headers;
      stream.remoteAddress = stream.address;
      client.on('message', function(data) {
        return stream.push(data);
      });
      stream.on('error', function (msg) {
        return client.stop();
      });
      client.on('close', function (reason) {
        stream.emit('close');
        stream.emit('end');
        return stream.end();
      });
      return share.listen(stream);
    }));

    self.app.use('/doc', share.rest());

    self.app.use(express.static(__dirname + "/site/"));

    mongoclient.connect('mongodb://localhost:27017/outputs', function (err, db) {
      if (!err) {
        self.app.get('/check', function(req, res) {
          db.collection('outputs', function (err, collection) {
            collection.find({
              id: req.query.id
            }).toArray(function(err, docs) {
              var output = "", i;
              for (i = 0; i < docs.length; i++) {
                output += docs[i].output;
              }
              res.send(output);
              collection.remove({
                id: req.query.id
              }, function (err, num) {
                if (err) throw new Error(err);
              });
            });
          });
        });
      }
    });
  };


  /**
   *  Initializes the application.
   */
  self.initialize = function() {
    self.setupVariables();
    self.setupTerminationHandlers();

    // Create the express server and routes.
    self.initializeServer();
  };


  /**
   *  Start the server.
   */
  self.start = function() {
    //  Start the app on the specific interface (and port).
    self.app.listen(self.port);
  };

  };



  /**
   *  main():  Main code.
   */
  var zapp = new App();
  zapp.initialize();
  zapp.start();
} else {
  mongoclient.connect('mongodb://localhost:27017/outputs', function (err, db) {
    if (!err) {
      jobs.process('compileAndRun', function (job, done) {
        var id = job.data.id;
        var proc;
        var name = '/tmp/' + id;

        fs.writeFileSync('/tmp/' + id + '.cpp', job.data.program);

        proc = exec('g++ -g -O2 -static -o ' + name + ' ' + name + '.cpp', function (error, stdout, stderr) {
          if (error) {
            done(new Error(stderr));
          } else {
            var run_proc;
            run_proc = execFile('./run', [name], {timeout: 1500}, function (error, stdout, stderr) {
              if (error) {
                throw new Error(error);
              }
              db.collection('outputs', function (err, collection) {
                var doc = {
                  id: job.id,
                  output: stdout.toString()
                };
                collection.insert(doc, {w:1}, function (err, result) {
                  if (err) {
                    console.log(err, result);
                  }
                });
              });
            });
            // Write the user's input to stdin
            run_proc.stdin.write(job.data.input);
            // Flush the stream by EOF
            run_proc.stdin.end();
            run_proc.on('close', function () {
              done();
            });
          }
        });
      });
    } else {
      throw new Error(err);
    }
  });
}
