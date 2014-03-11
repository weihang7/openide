$(function () {
  "use strict";
  var editor = ace.edit("editor"), submit_button = $("#submit"), output = $("#output"), timemem = $("#time_mem"), file_tip = $("#file_tip"), id, address = $("#url"), cover = $("#cover"), dialog = $("#dialog"), jobid, body = $("body"), input = $("#input"), input_file_tip = $("#input_file_tip"), orig_doc = "", orig_input = "", header = $("#header"), prev_dialog = $("#prev_dialog"), history = [], prev_wrapper = $("#prev_items_wrapper"), mark;

  editor.setReadOnly(true);
  // Get the ID of the document from the location query string
  id = location.search.slice(1);
  if (!id) {
    // If there is no ID, let the server give the user an ID.
    location.href = '/';
  } else {
    $.ajax({
      url: "/get_doc",
      method: "GET",
      data: {
        id: id
      },
      success: function (data) {
        if (data) {
          // Store the original values so that we can check whether they changed later
          orig_doc = data.program;
          orig_input = data.input;
          history = data.previous;
        }

        // We are no longer loading
        body.removeClass("wait");
        editor.setReadOnly(false);
        $("#loading").remove();

        editor.getSession().setMode("ace/mode/c_cpp");
        if (orig_doc.length === 0) {
          // Default echo program
          editor.getSession().setValue([
            '#include <iostream>',
            '#include <algorithm>',
            '',
            'using namespace std;',
            '',
            'int main() {',
            '    string s;',
            '    cin >> s;',
            '    cout << s;',
            '}'].join('\n'));
            input.val("Hello");
        } else {
          editor.getSession().setValue(orig_doc);
          input.val(orig_input);
        }

        editor.getSession().on('change', activateSave);

        input.on('keyup paste cut', activateSave);

        editor.focus();
      }
    });
  }

  function activateSave() {
    mark = "Your document has unsaved changes.";
    $("#save").prop("disabled", false).removeClass("disabled");
  }

  function check() {
    $.ajax({
      url: "/get",
      method: "GET",
      data: {
        id: jobid
      },
      dataType: "json",
      success: function (data) {
        var processed;
        if (data.state !== 'active' || !data) {
          if (data.state === 'failed') {
            timemem.empty();
            output.empty();
            // The actual error ends 6 characters before the at /home
            processed = data.error.substr(0, data.error.indexOf("at /home") - 6);
            output.append($("<b>").addClass("red").text(processed));
            body.removeClass("wait");
          } else {
            $.ajax({
              url: "/check",
              method: "GET",
              data: {
                "id": jobid
              },
              success: function (data) {
                var lines = data.split("\n"), tmidx = data.indexOf("time used");
                submit_button.prop('disabled', false).addClass("enabled").removeClass("disabled");
                body.removeClass("wait");
                if (tmidx === -1) {
                  output.text(data);
                } else if (lines[0].indexOf("Error") !== -1) {
                  output.empty();
                  output.append($("<b>").addClass("red").text(lines[0]));
                  timemem.html(lines[2] + "<br>" + lines[3]);
                } else if (lines[0].length === 0) {
                  output.text("Standard output is empty");
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

  function submit(id, program, input) {
    $.ajax({
      url: "/enqueue",
      method: "POST",
      data: {
        "type": "compileAndRun",
        "data": {
          "id": id,
          "program": program,
          "input": input
        }
      },
      success: function (data) {
        if (data.id) {
          jobid = data.id;
          check();
        }
      }
    });
  }

  submit_button.click(function () {
    body.addClass("wait");
    submit_button.prop('disabled', true).addClass("disabled").removeClass("enabled");
    submit(id, editor.getSession().getValue(), input.val());
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
        activateSave();
      }
    });
    $("#input_file").on("change", function (event) {
      var f = event.target.files[0], r;

      if (!f) {
        input_file_tip.text("Failed to load file.");
      } else {
        r = new FileReader();
        r.onload = function (event) {
          var contents = event.target.result;
          input.val(contents);
        };
        r.readAsText(f);
        activateSave();
      }
    });
  } else {
    $("#file_wrapper").hide();
  }

  $("#save").click(function () {
    if (editor.getSession().getValue() !== orig_doc || input.val() !== orig_input) {
      $.ajax({
        url: "/save",
        method: "POST",
        data: {
          id: id,
          program: editor.getSession().getValue(),
          input: input.val()
        },
        success: function (data) {
          mark = undefined;
          location.search = "?" + data.id;
          $("#save").prop("disabled", true).addClass("disabled");
        }
      });
    }
  });

  $("#share").click(function () {
    address.val(location.href);
    cover.show();
    dialog.show();
  });

  $("#done").click(function () {
    dialog.hide();
    cover.hide();
  });

  $("#prev").click(function () {
    var i;
    cover.show();
    prev_wrapper.empty();
    for (i = 0; i < history.length; i++) {
      prev_wrapper.append($("<div>").append($("<a>").prop('href', location.protocol + "//" + location.host + location.pathname + "?" + history[i].id).text(history[i].id)).append($("<div>").addClass("time").text($.timeago(new Date()))));
    }
    prev_dialog.show();
  });

  $("#prev_done").click(function () {
    cover.hide();
    prev_dialog.hide();
  });

  $(window).on('beforeunload', function () {
    return mark;
  });
});
