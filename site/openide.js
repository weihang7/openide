$(function () {
  "use strict";
  var editor = ace.edit("editor"), textarea = $("#program"), form = $("#form"), editor_el = $("#editor"), submit_button = $("#submit"), output = $("#output"), timemem = $("#time_mem"), share = $("#share"), file = $("#file"), file_tip = $("#file_tip"), id, address = $("#url"), cover = $("#cover"), dialog = $("#dialog"),, s = new BCSocket(null, {reconnect: true}), conn = new sharejs.Connection(s), doc;
  editor.getSession().setMode("ace/mode/c_cpp");
  submit_button.click(function () {
    submit_button.prop('disabled', true).addClass("disabled").removeClass("enabled");
    $.ajax({
      url: "/cgi-bin/enqueue.py",
      method: "POST",
      data: {
        "program": editor.getSession().getValue(),
        "input": $("#input").val()
      },
      success: function (data) {
        var lines = data.split("\n"), tmidx = data.indexOf("Time used");
        submit_button.prop('disabled', false).addClass("enabled").removeClass("disabled");
        if (tmidx === -1) {
          output.text(data);
        } else if (lines[0].indexOf("Error") !== -1) {
          output.empty();
          output.append($("<b>").addClass("red").text(lines[0]));
          timemem.html(lines[2] + "<br>" + lines[3]);
        } else if (lines[0].length === 0) {
          output.empty();
          output.text("Your program outputted nothing.");
          timemem.html(lines[1] + "<br>" + lines[2]);
        } else {
          output.text(data.substr(0, tmidx));
          timemem.html(data.substr(tmidx).replace(/\n/g, "<br>"));
        }
      }
    });
  });

  editor.focus();
  if (location.hash.length > 0) {
    id = location.hash.slice(1);
    doc = conn.get('programs', id);
    doc.subscribe();
    doc.whenReady(function () {
      if (!doc.type) {
        doc.create('text');
      }
      if (doc.type && doc.type.name === 'text') {
        doc.attach_ace(editor);
      }
    });
  } else if (localStorage.program) {
    editor.getSession().setValue(localStorage.program);
  } else {
    editor.getSession().setValue("#include <iostream>\n\nusing namespace std;\n\nint main() {\n    cout << \"Hello world!\" << endl;\n    return 0;\n}");
  }
  editor.on("change", function () {
    localStorage.program = editor.getSession().getValue();
  });
  if (window.FileReader) {
    file.on("change", function (event) {
      var f = event.target.files[0]; 

      if (!f) {
        file_tip.text("Failed to load file.");
      } else {
        var r = new FileReader();
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
  share.click(function () {
    if (!id) {
      $.ajax({
        url: "/cgi-bin/share.py",
        method: "POST",
        data: {
          program: editor.getSession().getValue()
        },
        success: function (data) {
          cover.show();
          dialog.show();
          address.val(location.href + "?" + data.id);
        }
      });
    } else {
      cover.show();
      dialog.show();
      address.val(location.href);
    }
  });
  $("#done").click(function () {
    cover.hide();
    dialog.hide();
  });
});
