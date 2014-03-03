$(function () {
  "use strict";
  var editor = ace.edit("editor"), submit_button = $("#submit"), output = $("#output"), timemem = $("#time_mem"), file_tip = $("#file_tip"), id, address = $("#url"), cover = $("#cover"), dialog = $("#dialog"), s = new BCSocket(null, {reconnect: true}), conn = new sharejs.Connection(s), doc, jobid, body = $("body"), input_doc, input = $("#input");

  editor.setReadOnly(true);
  // Get the ID of the document from the location hash
  id = location.hash.slice(1);
  if (!id) {
    // If there is no ID, let the server give the user an ID.
    location.href = '/';
  }
  doc = conn.get('programs', id);
  doc.subscribe();
  // When the document is ready, set up the editor
  doc.whenReady(function () {
    body.removeClass("wait");
    editor.setReadOnly(false);
    $("#loading").remove();
    editor.getSession().setMode("ace/mode/c_cpp");
    editor.focus();
    if (!doc.type) {
      doc.create('text');
    }
    if (doc.type && doc.type.name === 'text') {
      doc.attach_ace(editor);
      submit_button.prop('disabled', false).addClass("enabled").removeClass("disabled");
      if (doc.snapshot.length === 0) {
        editor.getSession().setValue("#include <iostream>\n#include <algorithm>\n\nusing namespace std;\n\nint main() {\n    cout << \"Hello world!\" << endl;\n    return 0;\n}");
      }
    }
  });

  // Also have a document for the input
  input_doc = conn.get('programs', id + "_input");
  input_doc.subscribe();
  input_doc.whenReady(function () {
    if (!input_doc.type) {
      input_doc.create('text');
    }
    if (input_doc.type && input_doc.type.name === 'text') {
      input_doc.attachTextarea(input[0]);
    }
  });
  function check() {
    $.ajax({
      url: "/queue/job/" + jobid,
      method: "GET",
      success: function (data) {
        var processed;
        if (data.state !== 'active' || !data) {
          if (data.state === 'failed') {
            timemem.empty();
            output.empty();
            // The actual error ends 6 characters before the at /home
            processed = data.error.substr(0, data.error.indexOf("at /home") - 6);
            output.append($("<b>").addClass("red").text(processed));
            submit_button.prop('disabled', false).addClass("enabled").removeClass("disabled");
            body.removeClass("wait");
          } else {
            $.ajax({
              url: "/check",
              method: "GET",
              data: {
                "id": jobid
              },
              success: function (data) {
                var lines = data.split("\n"), tmidx = data.indexOf("Time used");
                submit_button.prop('disabled', false).addClass("enabled").removeClass("disabled");
                body.removeClass("wait");
                if (tmidx === -1) {
                  output.text(data);
                } else if (lines[0].indexOf("Error") !== -1) {
                  output.empty();
                  output.append($("<b>").addClass("red").text(lines[0]));
                  timemem.html(lines[2] + "<br>" + lines[3]);
                } else if (lines[0].length === 0) {
                  output.text("Your program outputted nothing.");
                  timemem.html(lines[1] + "<br>" + lines[2]);
                } else {
                  output.text(data.substr(0, tmidx));
                  timemem.html(data.substr(tmidx).replace(/\n/g, "<br>"));
                }
              }
            });
          }
        } else {
          setTimeout(check, 1000);
        }
      }
    });
  }

  submit_button.click(function () {
    body.addClass("wait");
    submit_button.prop('disabled', true).addClass("disabled").removeClass("enabled");
    $.ajax({
      url: "/queue/job",
      method: "POST",
      data: {
        "type": "compileAndRun",
        "data": {
          "id": id,
          "program": editor.getSession().getValue(),
          "input": input.val()
        }
      },
      success: function (data) {
        if (data.message === "job created") {
          if (data.id) {
            jobid = data.id;
            setTimeout(check, 1000);
          }
        }
      }
    });
  });

  if (window.FileReader) {
    $("#file").on("change", function (event) {
      var f = event.target.files[0], r;

      if (!f) {
        file_tip.text("Failed to load file.");
      } else {
        r = new FileReader();
        r.onload = function (event) {
          var contents = event.target.result;
          editor.getSession().setValue(contents);
        };
        r.readAsText(f);
      }
    });
  } else {
    $("#file_wrapper").hide();
  }

  $("#share").click(function () {
    cover.show();
    dialog.show();
    address.val(location.href);
  });

  $("#done").click(function () {
    cover.hide();
    dialog.hide();
  });
});
