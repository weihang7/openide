#!/usr/bin/env node
var express     = require('express');
var fs          = require('fs');
var kue         = require('kue');
var jobs        = kue.createQueue({
    redis: {
        port: process.env.OPENSHIFT_REDIS_PORT,
        host: process.env.OPENSHIFT_REDIS_HOST,
        auth: process.env.REDIS_PASSWORD
    }
});
console.log(process.env.OPENSHIFT_REDIS_PORT);
var hat         = require('hat');
var rack        = hat.rack();
var sharejs     = require('share');
var livedb      = require('livedb');
var livedbMongo = require('livedb-mongo');
var connection_string = '127.0.0.1:27017/openide';
if(process.env.OPENSHIFT_MONGODB_DB_PASSWORD){
    connection_string = process.env.OPENSHIFT_MONGODB_DB_USERNAME + ":" +
    process.env.OPENSHIFT_MONGODB_DB_PASSWORD + "@" +
    process.env.OPENSHIFT_MONGODB_DB_HOST + ':' +
    process.env.OPENSHIFT_MONGODB_DB_PORT + '/' +
    process.env.OPENSHIFT_APP_NAME;
}
var backend     = livedb.client(livedbMongo(connection_string, {
    safe: true
}));
var share       = sharejs.server.createClient({
    backend: backend
});
var browserChannel = require('browserchannel').server;
var Duplex      = require('stream').Duplex;
var spawn       = require('child_process').spawn;


/**
 *  Define the sample application.
 */
var SampleApp = function() {

    //  Scope.
    var self = this;


    /*  ================================================================  */
    /*  Helper functions.                                                 */
    /*  ================================================================  */

    /**
     *  Set up server IP address and port # using env variables/defaults.
     */
    self.setupVariables = function() {
        //  Set the environment variables we need.
        self.ipaddress = process.env.OPENSHIFT_NODEJS_IP;
        self.port      = process.env.OPENSHIFT_NODEJS_PORT || 8080;

        if (typeof self.ipaddress === "undefined") {
            //  Log errors on OpenShift but continue w/ 127.0.0.1 - this
            //  allows us to run/test the app locally.
            console.warn('No OPENSHIFT_NODEJS_IP var, using 127.0.0.1');
            self.ipaddress = "127.0.0.1";
        };
    };


    /**
     *  Populate the cache.
     */
    self.populateCache = function() {
        if (typeof self.zcache === "undefined") {
            self.zcache = { 'index.html': '' };
        }

        //  Local cache for static content.
        self.zcache['index.html'] = fs.readFileSync('./index.html');
    };


    /**
     *  Retrieve entry (content) from cache.
     *  @param {string} key  Key identifying content to retrieve from cache.
     */
    self.cache_get = function(key) { return self.zcache[key]; };


    /**
     *  terminator === the termination handler
     *  Terminate server on receipt of the specified signal.
     *  @param {string} sig  Signal to terminate on.
     */
    self.terminator = function(sig){
        if (typeof sig === "string") {
           console.log('%s: Received %s - terminating sample app ...',
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
        self.routes = { };

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

        jobs.process('compileAndRun', function (job, done) {
            var id = job.data.id;
            var proc;

            fs.writeFileSync('/tmp/' + id + '.cpp', job.data.program);

            proc = spawn('clang++', ['-g', '-O2', '-o', '/tmp/' + id, '/tmp/' + id + '.cpp']);
            proc.stderr.on('data', function (data) {
                done(new Error(data));
            });
            proc.on('close', function (code) {
                fs.unlinkSync('/tmp/' + job.data.id + '.cpp');
            });
            done();
        });
    };


    /**
     *  Initializes the sample application.
     */
    self.initialize = function() {
        self.setupVariables();
        self.populateCache();
        self.setupTerminationHandlers();

        // Create the express server and routes.
        self.initializeServer();
    };


    /**
     *  Start the server (starts up the sample application).
     */
    self.start = function() {
        //  Start the app on the specific interface (and port).
        self.app.listen(self.port, self.ipaddress, function() {
            console.log('%s: Node server started on %s:%d ...',
                        Date(Date.now() ), self.ipaddress, self.port);
        });
    };

};   /*  Sample Application.  */



/**
 *  main():  Main code.
 */
var zapp = new SampleApp();
zapp.initialize();
zapp.start();

