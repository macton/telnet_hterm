// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f',
          'hterm');

// CSP means that we can't kick off the initialization from the html file,
// so we do it like this instead.
window.onload = function() {
  lib.init(telnet.init);
};

/**
 * The telnet-powered terminal command.
 *
 * This class defines a command that can be run in an hterm.Terminal instance.
 * The telnet command uses terminalPrivate extension API to create and use telnet
 * process on ChromeOS machine.
 *
 *
 * @param {Object} argv The argument object passed in from the Terminal.
 */
function telnet(argv) {
  this.argv_ = argv;
  this.io = null;
};

/**
 * Static initialier called from telnet.html.
 *
 * This constructs a new Terminal instance and instructs it to run the telnet
 * command.
 */
telnet.init = function() {
  var profileName = lib.f.parseQuery(document.location.search)['profile'];
  var terminal    = new hterm.Terminal(profileName);

  terminal.decorate(document.querySelector('#terminal'));

  // Looks like there is a race between this and terminal initialization, thus
  // adding timeout.
  setTimeout(function() {
      terminal.setCursorPosition(0, 0);
      terminal.setCursorVisible(true);
      terminal.runCommandClass(telnet, document.location.hash.substr(1));
    }, 500);

  return true;
};

/**
 * The name of this command used in messages to the user.
 *
 * Perhaps this will also be used by the user to invoke this command, if we
 * build a shell command.
 */
telnet.prototype.commandName = 'telnet';

/**
 * Start the telnet command.
 *
 * This is invoked by the terminal as a result of terminal.runCommandClass().
 */
telnet.prototype.run = function() {
  var self = this;

  self.io = self.argv_.io.push();
  self.terminal = self.io.terminal_;
  self.msgBuffer = '';

  if (!chrome.socket) {
    self.terminal.interpret("Sockets are not available in your version of Chrome.\r\n");
    self.terminal.interpret("You must have experimental socket support enabled in chrome://flags\r\n");
  }

  self.io.onVTKeystroke    = self.bufferKey_.bind(self);
  self.io.sendString       = self.sendString_.bind(self);
  self.io.onTerminalResize = self.onTerminalResize_.bind(self);
  document.body.onunload   = self.close_.bind(self);

  document.querySelector('#connect').onclick = function() {
    var host = document.querySelector('#host').value;
    var port = document.querySelector('#port').value | 0;
    connect(host, port);
    document.getElementById('connect_info').style.display = 'none';
    document.getElementById('terminal').style.display     = 'block';
  };

  /**
   * Connects to a host and port
   *
   * @param {String} host The remote host to connect to
   * @param {Number} port The port to connect to at the remote host
   */
  function connect(host, port) {
    self.tcpClient = new TcpClient(host, port);
    self.tcpClient.connect(function() {
      self.terminal.interpret("connected to " + host + " " + port + "\r\n" );
      self.tcpClient.addResponseListener(function(data) {
        self.terminal.interpret( data );
      });
    });
  }
};

telnet.prototype.onBeforeUnload_ = function(e) {
  var msg = 'Closing this tab will exit telnet.';
  e.returnValue = msg;
  return msg;
};

/**
 * Send a string to the telnet process.
 *
 * @param {string} string The string to send.
 */
telnet.prototype.sendString_ = function(string) {
  this.tcpClient.sendMessage(this.value);
};

/**
 * Buffers a key; Sends on ENTER
 *
 * @param {string} string The string from terminal
 */
telnet.prototype.bufferKey_ = function(string) {
  var self = this;
  if ( string.charAt(0) == '\r' ) {
    self.tcpClient.sendMessage(self.msgBuffer);
    self.msgBuffer = '';
    self.terminal.interpret(string);
  } else if ( string.charCodeAt(0) == 127 ) {
    if ( self.msgBuffer.length ) {
      self.msgBuffer = self.msgBuffer.slice(0,-1);
      self.terminal.interpret( '\x08\x1b[P');
    } else {
      self.terminal.interpret( '\x07' );
    }
  } else if ( string.charCodeAt(0) == 24 ) {
    self.close_();
  } else {
    self.msgBuffer += string;
    self.terminal.interpret(string);
  }
};

/**
 * Closes telnet terminal and exits the telnet command.
**/
telnet.prototype.close_ = function() {
  var self = this;
  self.tcpClient.disconnect();
  self.terminal.interpret( '\x1b[2J\x1b[1;1H');
  document.getElementById('connect_info').style.display = 'block';
  document.getElementById('terminal').style.display     = 'none';
}

/**
 * Notify process about new terminal size.
 *
 * @param {string|integer} terminal width.
 * @param {string|integer} terminal height.
 */
telnet.prototype.onTerminalResize_ = function(width, height) {
  // nothing...
  return;
};

/**
 * Exit the telnet command.
 */
telnet.prototype.exit = function(code) {
  this.close_();
  this.io.pop();
  window.onbeforeunload = null;

  if (this.argv_.onExit)
    this.argv_.onExit(code);
};
