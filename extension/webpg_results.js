/* <![CDATA[ */
$(function(){

    block_type_actions = [
        "public_key",
        "other_type"
    ]

    key_algorithm_types = {
        "RSA": "R",
        "DSA": "D",
        "ELG-E": "g",
    }

    function doResize(id, document, element_width) {
        height = document.body.scrollHeight
        block_size = $('.pgp_block_container')[0].offsetHeight + 60;
        if (block_size < height) {
            height = block_size;
        }
        if (height < 150) {
            height = 150;
        }
        if (element_width == undefined) {
            width = document.body.scrollWidth;
        } else {
            width = element_width;
        }
        chrome.extension.sendRequest({
            'msg': 'sendtoiframe',
            'cmd': 'resizeiframe',
            'iframe_id': qs.id,
            'element_width': element_width,
            'width': width,
            'height': height }
        );
    }

    var qs = {};
    (function () {
        var e,
            a = /\+/g,  // Regex for replacing addition symbol with a space
            r = /([^&=]+)=?([^&]*)/g,
            d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
            q = window.location.search.substring(1);

        while (e = r.exec(q))
           qs[d(e[1])] = d(e[2]);
    })();

    function createSignatureBox(signature_obj, sig_index) {
        sig_keyid = signature_obj.fingerprint.substr(-8);
        subkey_index = 0;
        key_name = sig_keyid;
        sigkey_url = null;
        email = null;
        if (signature_obj.status != "NO_PUBKEY") {
            for (pubkey in signature_obj.public_key) {
                key = signature_obj.public_key[pubkey];
                for (subkey in key.subkeys) {
                    if (key.subkeys[subkey].subkey == signature_obj.fingerprint) {
                        subkey_index = subkey;
                    }
                }
            }
            email = (key.uids[0].email.length > 1) ? "&lt;" + key.uids[0].email + 
                "&gt;" : "(no email address provided)";
            sigkey_url = chrome.extension.getURL("key_manager.html") +
                "?tab=-1&openkey=" + pubkey + "&opensubkey=" + subkey_index;
            key_name = key.name;
        }
        sig_class = "";
        sig_image = "stock_signature.png";
        if (signature_obj.status == "GOOD") {
            sig_image = "stock_signature-ok.png";
            sig_class = "sign-good"
        }
        if (signature_obj.status == "BAD_SIG") {
            sig_image = "stock_signature-bad.png";
            sig_class = "sign-revoked";
        }
        sig_box = "<div id='sig-" + sig_keyid + "-" + sig_index + "' class='signature-box " + sig_class + "'>" +
            "<img src='images/badges/" + sig_image + "'><div style='float:left;'><span class='signature-uid'>" +
            key_name + "</span>";

        if (sigkey_url)
            sig_box += "<span class='signature-keyid'>(<a href='#' id='" + sigkey_url +
                "' class='webpg-link'>" + sig_keyid + "</a>)</span>";

        sig_box += "<br/\>";

        if (email)
            sig_box += "<span class='signature-email'>" + email + "</span><br/\>";

        date_created = new Date(signature_obj.timestamp * 1000).toJSON();
        date_expires = (signature_obj.expiration == 0) ? 
            'Never' : new Date(signature_obj.expiration * 1000).toJSON().substring(0, 10);
        sig_box += "<span class='signature-keyid'>Created: " + date_created.substring(0, 10) + "</span><br/\>";
        sig_box += "<span class='signature-keyid'>Expires: " + date_expires + "</span><br/\>" +
            "<span class='signature-keyid'>Status: " + signature_obj.validity + "</span><br/\>" +
            "<span class='signature-keyid'>Validity: " + signature_obj.status + "</span></div></div>";
        return sig_box;
    }

    chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
        if (request.target_id == qs.id) {
            icon = document.createElement("img");
            switch(request.block_type) {

                case "encrypted_message":
                    icon.src = "/images/badges/stock_encrypted.png";
                    $(icon).addClass('footer_icon');
                    
                    gpg_error_code = request.verify_result.gpg_error_code;
                    if (gpg_error_code == "58") {
                        $('#header')[0].innerHTML = "<a name=\"" + qs.id + "\">PGP ENCRYPTED OR SIGNED MESSAGE</a>";
                        $('#footer').addClass("signature_bad_sig");
                        $('#footer')[0].innerHTML = "UNABLE TO DECRYPT OR VERIFY THIS MESSAGE<br/\>";
                    } else {
                        $('#header')[0].innerHTML += "<a name=\"" + qs.id + "\">PGP ENCRYPTED MESSAGE</a>";
                    }
                    if (request.verify_result.error) {
                        $('#signature_text')[0].innerText = request.verify_result.original_text;
                    } else {
                        $('#signature_text')[0].innerText = request.verify_result.data;
                    }
                    if (request.message_event == "manual" && request.verify_result.original_text.substr(0,5) == "-----") {
                        if (request.verify_result.signatures && request.verify_result.signatures.hasOwnProperty(0)) {
                            $('#header')[0].innerHTML = "<a name=\"" + qs.id + "\">PGP ENCRYPTED AND SIGNED MESSAGE</a>";
                            icon.src = "/images/badges/stock_decrypted-signature.png";
                            sig_ok = true;
                            sig_boxes = "<div class='signature-container'>";
                            for (sig in request.verify_result.signatures) {
                                if (request.verify_result.signatures[sig].status != "GOOD") {
                                    sig_ok = false;
                                }
                                sig_boxes += createSignatureBox(request.verify_result.signatures[sig], sig);
                            }
                            sig_boxes += "</div>";
                            $('#signature_text')[0].innerHTML += sig_boxes;
                            if (sig_ok) {
                                $('#footer').addClass("signature_good");
                                icon.src = "/images/badges/stock_decrypted-signature-ok.png";
                            }
                        } else {
                            icon.src = "/images/badges/stock_decrypted.png";
                        }
                    }
                    $('#footer')[0].innerHTML = icon.outerHTML;
                    $('#original_text')[0].innerText = request.verify_result.original_text;
                    $('#clipboard_input')[0].value = request.verify_result.original_text;
                    $('#original_text').hide();
                    if (gpg_error_code == "11" || gpg_error_code == "152") {
                        $('#footer').addClass("signature_no_pubkey");
                        if (gpg_error_code == "152") {
                            $('#footer')[0].innerHTML = "DECRYPTION FAILED; NO SECRET KEY<br/\>";
                        }
                        if (gpg_error_code == "11") {
                            if (request.message_type == "encrypted_message" && request.message_event == "manual") {
                                $('#footer')[0].innerHTML = "DECRYPTION FAILED; BAD PASSPHRASE <br/\>";
                                if (request.noninline) {
                                    $('#footer')[0].innerHTML += "<a class=\"decrypt_message\" href=\"#" + qs.id + "\"\">DECRYPT THIS MESSAGE</a> |";
                                }
                            } else {
                                $('#footer')[0].innerHTML += "<a class=\"decrypt_message\" href=\"#" + qs.id + "\"\">DECRYPT THIS MESSAGE</a> | ";
                            }
                        }
                    } else if (!request.verify_result.error) {
                        $('#footer').addClass("signature_good");
                    }
                    if (!request.verify_result.error && request.verify_result.original_text.length >0) {
                         $('#footer')[0].innerHTML += "<a class=\"original_text_link\" href=\"#" + qs.id + "\">DISPLAY ORIGINAL</a> | ";
                    }
                    $('#footer')[0].innerHTML += "<a class=\"copy_to_clipboard\" href=\"#\">COPY TO CLIPBOARD</a>";
                    doResize(qs.id, document, request.element_width);
                    $('.original_text_link').click(function(){
                        if (this.innerHTML == "DISPLAY ORIGINAL"){
                            $('#signature_text').hide();
                            $('#original_text').show();
                            doResize(qs.id, document, request.element_width);
                            this.innerHTML = "HIDE ORIGINAL";
                        } else {
                            this.innerHTML = "DISPLAY ORIGINAL";
                            $('#signature_text').show();
                            $('#original_text').hide();
                            doResize(qs.id, document, request.element_width);
                        }
                    });
                    break;

                case "signed_message":
                    $('#header')[0].innerHTML = "<a name=\"" + qs.id + "\">PGP SIGNED MESSAGE</a>";
                    if (request.verify_result.error) {
                        $('#signature_text')[0].innerText = request.verify_result.original_text;
                    } else {
                        $('#signature_text')[0].innerText = request.verify_result.data;
                    }
                    $('#clipboard_input')[0].value = request.verify_result.original_text;

                    gpg_error_code = request.verify_result.gpg_error_code;
                    if (gpg_error_code == "58") {
                        $('#footer').addClass("signature_bad_sig");
                        icon.src = "/images/badges/stock_signature-bad.png";
                        $(icon).addClass('footer_icon');
                        $('#footer')[0].innerHTML = icon.outerHTML;
                        $('#footer')[0].innerHTML += "THE SIGNATURE ON THIS MESSAGE IS INVALID; THE SIGNATURE MIGHT BE TAMPERED WITH<br/\>";
                        $('#footer')[0].innerHTML += "<a class=\"copy_to_clipboard\" href=\"#\">COPY TO CLIPBOARD</a>";
                    }
                    $('#original_text')[0].innerText = request.verify_result.original_text;
                    $('#original_text').hide();
                    for (sig in request.verify_result.signatures) {
                        sig_boxes = "<div class='signature-container'>";
                        for (sig in request.verify_result.signatures) {
                            sig_boxes += createSignatureBox(request.verify_result.signatures[sig], sig);
                        }
                        sig_boxes += "</div>";
                        $('#signature_text')[0].innerHTML += sig_boxes;
                        if (request.verify_result.signatures[sig].status == "GOOD") {
                            icon.src = "/images/badges/stock_signature-ok.png";
                            $(icon).addClass('footer_icon');
                            $('#footer').addClass("signature_good");
                            $('#footer')[0].innerHTML = icon.outerHTML;
                            key_id = request.verify_result.signatures[sig].fingerprint.substring(16, -1)
                            sig_fp = request.verify_result.signatures[sig].fingerprint;
                            public_keys = request.verify_result.signatures[sig].public_key;
                            sigkey_link = key_id;
                            if (public_keys) {
                                for (pubkey in public_keys) {
                                    for (pubkey_subkey in public_keys[pubkey].subkeys) {
                                        if (sig_fp == public_keys[pubkey].subkeys[pubkey_subkey].subkey) {
                                            sigkey_url = chrome.extension.getURL("key_manager.html") +
                                                "?tab=-1&openkey=" + pubkey + "&opensubkey=" +
                                                pubkey_subkey;
                                            sigkey_link = "<a href='#;' id='" + sigkey_url + "' class='webpg-link'>" +
                                                key_id + "</a>";
                                        }
                                    }
                                }
                            }
                            $('#footer')[0].innerHTML += "THIS MESSAGE WAS SIGNED WITH KEY " + sigkey_link + "<br/\><a class=\"original_text_link\" href=\"#" + qs.id + "\">DISPLAY ORIGINAL</a> | ";
                            $('#footer')[0].innerHTML += "<a class=\"copy_to_clipboard\" href=\"#\">COPY TO CLIPBOARD</a>";
                        }
                        if (request.verify_result.signatures[sig].status == "GOOD_EXPKEY") {
                            $('#footer').addClass("signature_no_pubkey");
                            $('#footer')[0].innerHTML = "THIS MESSAGE WAS SIGNED WITH AN EXPIRED PUBLIC KEY<br/\>";
                            $('#footer')[0].innerHTML += "<a class=\"original_text_link\" href=\"#" + qs.id + "\">DISPLAY ORIGINAL</a> | ";
                            $('#footer')[0].innerHTML += "<a class=\"copy_to_clipboard\" href=\"#\">COPY TO CLIPBOARD</a> | ";
                            $('#footer')[0].innerHTML += "<a href=\"#\">TRY TO FETCH RENEWED KEY</a>";
                        }
                        if (request.verify_result.signatures[sig].status == "NO_PUBKEY") {
                            $('#footer').addClass("signature_no_pubkey");
                            $('#footer')[0].innerHTML = "THIS MESSAGE WAS SIGNED WITH A PUBLIC KEY NOT IN YOUR KEYRING<br/\>";
                            $('#footer')[0].innerHTML += "<a class=\"original_text_link\" href=\"#" + qs.id + "\">DISPLAY ORIGINAL</a> | ";
                            $('#footer')[0].innerHTML += "<a class=\"copy_to_clipboard\" href=\"#\">COPY TO CLIPBOARD</a> | ";
                            $('#footer')[0].innerHTML += "<a href=\"#\">TRY TO FETCH MISSING KEY</a>";
                        }
                        if (request.verify_result.signatures[sig].status == "BAD_SIG") {
                            $('#footer').addClass("signature_bad_sig");
                            icon.src = "/images/badges/stock_signature-bad.png";
                            $(icon).addClass('footer_icon');
                            $('#footer')[0].innerHTML = icon.outerHTML;
                            $('#footer')[0].innerHTML += "THE SIGNATURE ON THIS MESSAGE FAILED; THE MESSAGE MAY BE TAMPERED WITH<br/\>";
                            $('#footer')[0].innerHTML += "<a class=\"original_text_link\" href=\"#" + qs.id + "\">DISPLAY ORIGINAL</a> | ";
                            $('#footer')[0].innerHTML += "<a class=\"copy_to_clipboard\" href=\"#\">COPY TO CLIPBOARD</a>";
                        }
                    }
                    doResize(qs.id, document, request.element_width);
                    $('.webpg-link').click(function() {
                        chrome.extension.sendRequest({
                            'msg': "newtab",
                            'url': this.id,
                            }
                        );
                    });
                    $('.original_text_link').click(function(){
                        if (this.innerHTML == "DISPLAY ORIGINAL"){
                            $('#signature_text').hide();
                            $('#original_text').show();
                            doResize(qs.id, document, request.element_width);
                            this.innerHTML = "HIDE ORIGINAL";
                        } else {
                            this.innerHTML = "DISPLAY ORIGINAL";
                            $('#signature_text').show();
                            $('#original_text').hide();
                            doResize(qs.id, document, request.element_width);
                        }
                    });
                    break;

                case "public_key":
                    $('#header')[0].innerHTML = "<a name=\"" + qs.id + "\">PGP PUBLIC KEY</a>";
                    $('#original_text')[0].innerText = request.original_text;
                    $('#clipboard_input')[0].value = request.original_text;
                    icon.src = "/images/badges/stock_keypair.png";
                    $(icon).addClass('footer_icon');
                    $('#footer')[0].innerHTML = icon.outerHTML;
                    var get_key_response = null;
                    import_status = null;
                    chrome.extension.sendRequest({
                        msg: 'doKeyImport',
                        data: request.original_text,
                        temp_context: true,
                    },
                        function(response) {
                            var fpsi = {};
                            fpsi.keys_found = [];
                            fpsi.keys_imported = [];
                            var import_status = response.result.import_status;
                            for (imported in import_status.imports) {
                                if (import_status.imports[imported].fingerprint != "unknown" &&
                                    import_status.imports[imported].result == "Success") {
                                    key_id = import_status.imports[imported].fingerprint;
                                    chrome.extension.sendRequest({
                                        msg: "getNamedKey",
                                        "key_id": key_id,
                                        temp_context: true},
                                        function(get_key_response) {
                                            key = get_key_response.result;
                                            fpsi.keys_found[fpsi.keys_found.length] = key;
                                            if (import_status.imports[imported].new_key){
                                                fpsi.keys_imported[fpsi.keys_imported.length] = key;
                                                chrome.extension.sendRequest({
                                                    msg: 'deleteKey',
                                                    key_type: "public_key",
                                                    key_id: key_id,
                                                    temp_context: true, }
                                                );
                                            }
                                            for (key in fpsi.keys_found[0]) {
                                                keyobj = fpsi.keys_found[0][key];
                                                if (keyobj.in_real_keyring) {
                                                    new_public_key = false; //(fpsi.keys_imported.length && key in fpsi.keys_imported[0]);
                                                    keyobj = keyobj.real_keyring_item;
                                                } else {
                                                    new_public_key = true;
                                                }
<!--                                                email = (keyobj.email.length > 1) ? "&lt;<a href=\"mailto:" + keyobj.email + "\">" + keyobj.email +-->
<!--                                                    "</a>&gt;" : "no email address provided";-->
<!--                                                $('#signature_text')[0].innerHTML = "<span class=\"uid_line\">" + keyobj.name + " " + email + "</span>";-->
                                                $('#signature_text')[0].innerHTML = "Names/UIDs on Key:"
                                                $('#signature_text')[0].innerHTML += "<ul>";
                                                for (uid in keyobj.uids) {
                                                    uid_email = (keyobj.uids[uid].email.length > 1) ? "<a href=\"mailto:" + 
                                                        keyobj.uids[uid].email + "\">" + keyobj.uids[uid].email +
                                                        "</a>" : "";
                                                    sig_class = "sig_class_normal";
                                                    $('#signature_text')[0].innerHTML += "<li>" + keyobj.uids[uid].uid + 
                                                        " &lt;" + uid_email + "&gt;</li>";
                                                }
                                                $('#signature_text')[0].innerHTML += "</ul>";
                                                $('#signature_text')[0].innerHTML += "<br/\>";
                                                key_algo = {}
                                                key_algo.abbr = "?"
                                                key_algo.name = keyobj.subkeys[0].algorithm_name;
                                                if (key_algo.name in key_algorithm_types) {
                                                    key_algo.abbr = key_algorithm_types[key_algo.name];
                                                }
                                                $('#header')[0].innerHTML += " (" + keyobj.subkeys[0].size + key_algo.abbr + "/" + keyobj.fingerprint.substr(-8) + ")<br/\>";
                                                created = new Date();
                                                created.setTime(keyobj.subkeys[0].created*1000);
                                                expires = new Date();
                                                expires.setTime(keyobj.subkeys[0].expires*1000);
                                                $('#signature_text')[0].innerHTML += "Created: " + created.toUTCString() + "<br/\>";
                                                $('#signature_text')[0].innerHTML += "Expires: " + expires.toUTCString() + "<br/\>";
                                                $('#footer').addClass("public_key");
                                                if (new_public_key) {
                                                    $('#footer')[0].innerHTML += "THIS KEY IS NOT IN YOUR KEYRING<br/\>";
                                                } else {
                                                    key_url = chrome.extension.getURL("key_manager.html") +
                                                        "?tab=-1&openkey=" + keyobj.fingerprint.substr(-16);
                                                    key_link = "(<a href='#' id='" + key_url +
                                                        "' class='webpg-link'>" + keyobj.fingerprint.substr(-8) + "</a>)";
                                                    $('#footer')[0].innerHTML += "THIS KEY " + key_link + " IS IN YOUR KEYRING<br/\>";
                                                }
                                                $('#footer')[0].innerHTML += "<a class=\"original_text_link\" href=\"#" + qs.id + "\">DISPLAY ORIGINAL</a> | ";
                                                if (new_public_key) {
                                                    // This is a key we don't already have, make import available
                                                    $('#footer')[0].innerHTML += "<a class=\"import_key_link\" href=\"#\">IMPORT THIS KEY</a> | ";
                                                } else {
                                                    // This is a key we already have, make delete available
                                                    $('#footer')[0].innerHTML += "<a class=\"delete_key_link\" href=\"#\" id=\"" + keyobj.fingerprint + "\">DELETE THIS KEY</a> | ";
                                                }
                                                $('#footer')[0].innerHTML += "<a class=\"copy_to_clipboard\" href=\"#\">COPY TO CLIPBOARD</a>";

                                                $('.delete_key_link').click(function(){
                                                    chrome.extension.sendRequest({
                                                        msg: 'deleteKey',
                                                        key_type: "public_key",
                                                        key_id: this.id },
                                                        function(response) {
                                                            window.location.reload();
                                                        }
                                                    );
                                                })
                                                $('.webpg-link').click(function() {
                                                    chrome.extension.sendRequest({
                                                        'msg': "newtab",
                                                        'url': this.id,
                                                        }
                                                    );
                                                });
                                                $('.original_text_link').click(function(){
                                                    remote_log("display original link clicked...");
                                                    if (this.innerHTML == "DISPLAY ORIGINAL"){
                                                        $('#signature_text').hide();
                                                        $('#original_text').show();
                                                        doResize(qs.id, document, request.element_width);
                                                        this.innerHTML = "HIDE ORIGINAL";
                                                    } else {
                                                        this.innerHTML = "DISPLAY ORIGINAL";
                                                        $('#signature_text').show();
                                                        $('#original_text').hide();
                                                        doResize(qs.id, document, request.element_width);
                                                    }
                                                });
                                                $('.import_key_link').click(function(){
                                                    remote_log("import link clicked...");
                                                    chrome.extension.sendRequest({
                                                        msg: 'doKeyImport',
                                                        data: request.original_text },
                                                        function(response) {
                                                            window.location.reload();
                                                        }
                                                    );
                                                })
                                                if ($('.original_text_link')[0].innerHTML == "DISPLAY ORIGINAL")
                                                    doResize(qs.id, document, request.element_width);
                                            }
                                        }
                                    )
                                } else {
                                    $('#footer')[0].innerHTML += "<a class=\"original_text_link\" href=\"#" + qs.id + "\">DISPLAY ORIGINAL</a> | ";
                                    $('#footer')[0].innerHTML += "<a class=\"import_key_link\" href=\"#\">IMPORT THIS KEY</a> | ";
                                    $('#footer')[0].innerHTML += "<a class=\"copy_to_clipboard\" href=\"#\">COPY TO CLIPBOARD</a>";
                                }
                                $('#original_text').hide();
                                doResize(qs.id, document, request.element_width);
                                $('.original_text_link').click(function(){
                                    remote_log("display original link clicked...");
                                    if (this.innerHTML == "DISPLAY ORIGINAL"){
                                        $('#signature_text').hide();
                                        $('#original_text').show();
                                        doResize(qs.id, document, request.element_width);
                                        this.innerHTML = "HIDE ORIGINAL";
                                    } else {
                                        this.innerHTML = "DISPLAY ORIGINAL";
                                        $('#signature_text').show();
                                        $('#original_text').hide();
                                        doResize(qs.id, document, request.element_width);
                                    }
                                });
                                $('.import_key_link').click(function(){
                                    remote_log("import link clicked...");
                                    chrome.extension.sendRequest({
                                        msg: 'doKeyImport',
                                        data: request.original_text },
                                        function(response) {
                                            window.location.reload();
                                        }
                                    );
                                })
                                $('.copy_to_clipboard').click(function(){
                                    $('#clipboard_input')[0].select();
                                    if (document.execCommand("Copy")) {
                                        console.log("Text copied to clipboard!");
                                    } else {
                                        console.log("There may have been a problem copying the text to the clipboard...");
                                    }
                                })
                            }
                        }
                    );
                    break;

            }
            if (sendResponse) {
                sendResponse({'result': "done"});
            }
            $('.copy_to_clipboard').click(function(){
                $('#clipboard_input')[0].select();
                if (document.execCommand("Copy")) {
                    console.log("Text copied to clipboard!");
                } else {
                    console.log("There may have been a problem copying the text to the clipboard...");
                }
            })
            $('.decrypt_message').click(function(){
                chrome.extension.sendRequest({
                    msg: 'decrypt',
                    data: $('#clipboard_input')[0].value },
                    function(response) {
                        $('.decrypt_status').remove();
                        if (response.result.error) {
                            if (response.result.gpg_error_code == "11") {
                                $("<span class='decrypt_status'>DECRYPTION FAILED; BAD PASSPHRASE<br/\></span>").insertBefore($($('#footer')[0].firstChild));
                            }
                        } else {
                            $('#signature_text')[0].innerText = response.result.data;
                            if (request.verify_result.signatures && response.result.signatures.hasOwnProperty(0)) {
                                $('#header')[0].innerHTML = "<a name=\"" + qs.id + "\">PGP ENCRYPTED AND SIGNED MESSAGE</a>";
                                icon.src = "/images/badges/stock_decrypted-signature.png";
                                sig_ok = true;
                                sig_boxes = "<div class='signature-container'>";
                                for (sig in response.result.signatures) {
                                    if (response.result.signatures[sig].status != "GOOD") {
                                        sig_ok = false;
                                    }
                                    sig_boxes += createSignatureBox(response.result.signatures[sig], sig);
                                }
                                sig_boxes += "</div>";
                                $('#signature_text')[0].innerHTML += sig_boxes;
                                if (sig_ok) {
                                    $('#footer').addClass("signature_good");
                                    icon.src = "/images/badges/stock_decrypted-signature-ok.png";
                                }
                            } else {
                                icon.src = "/images/badges/stock_decrypted.png";
                            }
                            $(icon).addClass('footer_icon');
                            $('#footer')[0].innerHTML = icon.outerHTML;
                            $('#footer')[0].innerHTML += "<a class=\"original_text_link\" href=\"#" + qs.id + "\">DISPLAY ORIGINAL</a> | ";
                            $('#footer')[0].innerHTML += "<a class=\"copy_to_clipboard\" href=\"#\">COPY TO CLIPBOARD</a>";
                            $('.original_text_link').click(function(){
                                remote_log("display original link clicked...");
                                if (this.innerHTML == "DISPLAY ORIGINAL"){
                                    $('#signature_text').hide();
                                    $('#original_text').show();
                                    doResize(qs.id, document, request.element_width);
                                    this.innerHTML = "HIDE ORIGINAL";
                                } else {
                                    this.innerHTML = "DISPLAY ORIGINAL";
                                    $('#signature_text').show();
                                    $('#original_text').hide();
                                    doResize(qs.id, document, request.element_width);
                                }
                            });
                            $('.copy_to_clipboard').click(function(){
                                $('#clipboard_input')[0].select();
                                if (document.execCommand("Copy")) {
                                    console.log("Text copied to clipboard!");
                                } else {
                                    console.log("There may have been a problem copying the text to the clipboard...");
                                }
                            })
                            $('.webpg-link').click(function() {
                                chrome.extension.sendRequest({
                                    'msg': "newtab",
                                    'url': this.id,
                                    }
                                );
                            });
                            doResize(qs.id, document, request.element_width);
                        }
                    }
                );
                doResize(qs.id, document, request.element_width);
            })
        }
    });

    function remote_log(data) {
        chrome.extension.sendRequest({
            msg: "log",
            data: data,
        });
    }

});
/* ]]> */