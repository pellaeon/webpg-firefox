/* setup the preferences object
    this is probably overkill for chrome/chromium, but added as generic object
        for use in extensions for other browsers.
*/
var webpg_prefs = {
    webpg_enabled: {
        get: function() {
            return window.localStorage.getItem('enabled');
        },
        set: function(value) {
            window.localStorage.setItem('enabled', value);
        },
    },
    decorate_inline: {
        get: function() {
            return window.localStorage.getItem('decorate_inline')
        },
        set: function(value) {
            window.localStorage.setItem('decorate_inline', value);
        },
    },
    encrypt_to_self: {
        get: function() {
            encrypt_to = plugin.gpgGetPreference('encrypt-to').value
            default_key = plugin.gpgGetPreference('default-key').value
            return (encrypt_to == default_key) ? true : false;
        },
        set: function(value) {
            // if this setting is disabled, remove the value for 'encrypt-to'
            if (!value) {
                plugin.gpgSetPreference('encrypt-to', '');
            } else {
                default_key = plugin.gpgGetPreference('default-key').value
                plugin.gpgSetPreference('encrypt-to', default_key);
            }
        },
    },
    gnupghome: {
        get: function() {
            return window.localStorage.getItem('gnupghome')
        },
        set: function(value) {
            window.localStorage.setItem('gnupghome', value);
        },
        clear: function(){
            window.localStorage.setItem('gnupghome', '');
        },
    },
    enabled_keys: {
        get: function() {
            keys_arr = [];
            if (window.localStorage.getItem('enabled_keys')) {
                keys_arr = window.localStorage.getItem('enabled_keys').split(',');
            }
            return keys_arr;
        },
        add: function(keyid) {
            keys_arr = this.get();
            keys_arr.push(keyid);
            window.localStorage.setItem('enabled_keys', keys_arr);
        },
        remove: function(keyid) {
            keys_tmp = this.get();
            keys_arr = [];
            for (key in keys_tmp) {
                if (keys_tmp[key] != keyid) {
                    keys_arr.push(keys_tmp[key]);
                }
            }
            window.localStorage.setItem('enabled_keys', keys_arr);
        },
        clear: function(){
            window.localStorage.setItem('enabled_keys', '');
        },
        length: function(){
            keys_tmp = [];
            if (window.localStorage.getItem('enabled_keys')) {
                store_value = window.localStorage.getItem('enabled_keys').split(',');
                for (key in store_value) {
                    keys_tmp.push(store_value[key]);
                }
            }
            return keys_tmp.length + 1;
        },
        has: function(keyid){
            key_arr = this.get();
            for (var i = 0; i < this.length(); i++) {
                if (key_arr[i] == keyid)
                    return true;
            }
            return false;
        },
    },
    default_key: {
        get: function() {
            return plugin.gpgGetPreference('default-key').value
        },
        set: function(keyid) {
            if (webpg_prefs.encrypt_to_self.get() == 'true') {
                plugin.gpgSetPreference("encrypt-to", keyid);
            }
            plugin.gpgSetPreference("default-key", keyid);
        },
        clear: function(keyid) {
            plugin.gpgSetPreference('default-key', '');
        },
    },
};
/* end prefs setup */

var gnupghome = "";

var webpgBackground = {

    init: function() {
        if (!localStorage.config_complete) {
            // The configuration druid has not run, we need to start it.
            //chrome.tabs.create({url: chrome.extension.getURL('druid.html')});
        }

        gnupghome = (webpg_prefs.gnupghome.get()) ? webpg_prefs.gnupghome.get() : "";

        // if the plugin is already present, remove it from the DOM
        if (document.getElementById("plugin")) {
            document.body.removeChild(document.getElementById("plugin"));
        }

        // information and source code for the plugin can be found here:
        //      https://github.com/kylehuff/webpg-npapi
        embed = "<embed id='plugin' type='application/x-webpg'/>"
        document.body.innerHTML += embed;

        plugin = document.getElementById("plugin");
        console.log("my plugin returned: " + plugin.valid);

        if (plugin.valid && !plugin.webpg_status["error"]) {
            plugin.addEventListener("keygenprogress", webpgBackground.gpgGenKeyProgress, false);
            plugin.addEventListener("keygencomplete", webpgBackground.gpgGenKeyComplete, false);

            /* Check to make sure all of the enabled_keys are private keys 
                this would occur if the key was enabled and then the secret key was deleted. */
            secret_keys = plugin.getPrivateKeyList();
            enabled_keys = webpg_prefs.enabled_keys.get();
            for (key in enabled_keys){
                if (enabled_keys[key] in secret_keys == false){
                    webpg_prefs.enabled_keys.remove(enabled_keys[key]);
                }
            }
            console.log("background initted");
        } else {
            if (plugin.valid == undefined) {
                plugin.webpg_status = {
                    "error": true,
                    "gpg_error_code": -1,
                    "error_string": "libgpgme not found",
                    "file": "webpgPluginAPI.cpp",
                    "line": -1,
                }
            }
            chrome.tabs.create({url: chrome.extension.getURL('error.html')});
        }


    },


    // Called when a message is passed.
    onRequest: function(request, sender, sendResponse) {
        // set the default response to null
        response = null;
        // Show the page action for the tab that the sender (content script) was on.
        if (request.msg == 'enabled') {
            response = {'enabled': webpg_prefs.webpg_enabled.get() };
        }
        if (request.msg == 'decorate_inline') {
            response = {'decorate_inline': webpg_prefs.decorate_inline.get() };
        }
        if (request.msg == 'newtab') {
            response = chrome.tabs.create({
                'url': request.url,
                'index': sender.tab.index + 1,
            });
        }
        if (request.msg == 'decrypt') {
            //console.log("gpgDecrypt requested");
            response = plugin.gpgDecrypt(request.data);
            for (sig in response.signatures) {
                sig_fp = response.signatures[sig].fingerprint;
                key_request = plugin.getNamedKey(sig_fp);
                response.signatures[sig].public_key = key_request;
            }
            response.original_text = request.data;
        }
        if (request.msg == 'verify') {
            //console.log("gpgVerify requested", request);
            response = plugin.gpgVerify(request.data);
            for (sig in response.signatures) {
                sig_fp = response.signatures[sig].fingerprint;
                key_request = plugin.getNamedKey(sig_fp);
                response.signatures[sig].public_key = key_request;
            }
            response.original_text = request.data;
        }
        if (request.msg == 'async-gpgGenKey') {
            //console.log("async-gpgGenKey requested");
            var result = plugin.gpgGenKey(
                    request.data['publicKey_algo'],
                    request.data['publicKey_size'],
                    request.data['subKey_algo'],
                    request.data['subKey_size'],
                    request.data['uid_0_name'],
                    '',
                    request.data['uid_0_email'],
                    request.data['key_expire'],
                    request.data['passphrase']
                );
            response = "queued";
        }
        if (request.msg == 'async-gpgGenSubKey') {
            //console.log("async-gpgGenKey requested");
            var result = plugin.gpgGenSubKey(
                request.data['key_id'],
                request.data['subKey_algo'],
                request.data['subKey_size'],
                request.data['key_expire'],
                request.data['sign_flag'],
                request.data['enc_flag'],
                request.data['auth_flag']
            );
            response = "queued";
        }
        if (request.msg == 'doKeyImport') {
            if (request.temp_context) {
                temp_path = plugin.getTemporaryPath();
                if (!temp_path)
                    temp_path = "/tmp/.gnupg";
                plugin.gpgSetHomeDir(temp_path);
            }
            import_status = plugin.gpgImportKey(request.data);
            if (!import_status.imports.hasOwnProperty(0)) {
                console.log("NO IMPORT; Something failed", request.data, import_status);
                import_status = { 'imports':
                    { 0 : {
                        'new_key': false,
                        'fingerprint': 'unknown',
                    }}
                }
            }
            if (request.temp_context) {
                plugin.gpgSetHomeDir(gnupghome);
            }
            response = {
                'import_status': import_status
            };
        }
        if (request.msg == 'encrypt') {
            response = plugin.gpgEncrypt(request.data, request.recipients, "", "");
        }
        if (request.msg == 'sendtoiframe') {
            //we need to send a message the action badge
            chrome.tabs.sendRequest(sender.tab.id, request);
        }
        if (request.msg == 'deleteKey'){
            if (request.temp_context) {
                temp_path = plugin.getTemporaryPath();
                if (!temp_path)
                    temp_path = "/tmp/.gnupg";
                plugin.gpgSetHomeDir(temp_path);
            }
            if (request.key_type == 'public_key'){
                response = plugin.gpgDeletePublicKey(request.key_id);
            } else if (request.key_type == 'private_key'){
                response = plugin.gpgDeletePrivateKey(request.key_id);
            }
            if (request.temp_context) {
                plugin.gpgSetHomeDir(gnupghome);
            }
        }
        if (request.msg == "getNamedKey") {
            if (request.temp_context) {
                temp_path = plugin.getTemporaryPath();
                if (!temp_path)
                    temp_path = "/tmp/.gnupg";
                plugin.gpgSetHomeDir(temp_path);
            }
            response = plugin.getNamedKey(request.key_id);
            if (request.temp_context) {
                plugin.gpgSetHomeDir(gnupghome);
                real_keyring_items = plugin.getNamedKey(request.key_id);
                for (real_keyring_item in real_keyring_items) {
                    for (subkey in real_keyring_items[real_keyring_item].subkeys) {
                        subkey_id = real_keyring_items[real_keyring_item].subkeys[subkey].subkey;
                        if (subkey_id == request.key_id) {
                            response[real_keyring_item].in_real_keyring = true;
                            response[real_keyring_item].real_keyring_item = real_keyring_items[real_keyring_item];
                        }
                    }
                }
            }
        }
        if (request.msg == "log") {
            response = null;
            console.log("Remote log request recieved; ", request.data);
        }
        if(request.msg == "create_menu") {
            chrome.contextMenus.removeAll(function() {
                chrome.contextMenus.create({
                    "type" : "separator",
                    "contexts" : ["editable"]
                });
                if ("paste" in request.context_menuitems) {
                    enabled_keys = webpg_prefs.enabled_keys.get()
                    if (enabled_keys.length > 1) {
                        callout = chrome.contextMenus.create({
                            "title" : "Paste Public Key",
                            "contexts" : ["editable"],
                        });
                        for (keyid in enabled_keys) {
                            chrome.contextMenus.create({
                                "title" : enabled_keys[keyid],
                                "contexts" : ["editable"],
                                "type" : "normal",
                                "parentId" : callout,
                                "onclick" : function(info, tab) {
                                    pubkey = plugin.gpgExportPublicKey(keyid).result;
                                    chrome.tabs.sendRequest(sender.tab.id, {'msg': 'insertPublicKey', 'data': pubkey});
                                }
                            });
                        }
                    } else {
                        chrome.contextMenus.create({
                            "title" : "Paste Public Key [" + enabled_keys[0] + "]",
                            "contexts" : ["editable"],
                            "type" : "normal",
                            "onclick" : function(info, tab) {
                                pubkey = plugin.gpgExportPublicKey(enabled_keys[0]).result;
                                chrome.tabs.sendRequest(sender.tab.id, {'msg': 'insertPublicKey', 'data': pubkey});
                            }
                        });
                    }
                }
                if ("sign" in request.context_menuitems) {
                    chrome.contextMenus.create({
                        "title" : "Clear-sign this text",
                        "contexts" : ["editable"],
                        "type" : "normal",
                        "onclick" : function(info, tab) {
                            signing_key = webpg_prefs.default_key.get()
                            data = request.context_menuitems["sign"].data
                            sign_status = plugin.gpgSignText([signing_key], data, 2);
                            if (!sign_status.error && sign_status.data.length > 0) {
                                chrome.tabs.sendRequest(sender.tab.id, {'msg': 'insertSignedData',
                                    'data': sign_status.data,
                                    'pre' : request.context_menuitems["sign"].pre,
                                    'post' : request.context_menuitems["sign"].post});
                            }
                        }
                    });
                }
                if ("import" in request.context_menuitems) {
                    chrome.contextMenus.create({
                        "title" : "Import this Key",
                        "contexts" : ["editable"],
                        "type" : "normal",
                        "onclick" : function(info, tab) {
                            import_status = plugin.gpgImportKey(request.data);
                        }
                    });
                }
                if ("encrypt" in request.context_menuitems) {
                    callout = chrome.contextMenus.create({
                        "title" : "Encrypt to",
                        "contexts" : ["editable"],
                        "type" : "normal",
                        "onclick" : function(info, tab) {
                                keylist = plugin.getPublicKeyList();
                                chrome.tabs.sendRequest(sender.tab.id, {'msg': 'openKeySelectionDialog',
                                    'keylist': keylist,
                                    'data': request.context_menuitems["encrypt"].data
                                }
                            );
                        }
                    });
                }
                if ("decrypt" in request.context_menuitems) {
                    chrome.contextMenus.create({
                        "title" : "Decrypt this text",
                        "contexts" : ["editable"],
                        "type" : "normal",
                        "onclick" : function(info, tab) {
                            console.log(request.context_menuitems['decrypt'].data)
                            decrypt_status = plugin.gpgDecrypt(request.context_menuitems['decrypt'].data);
                            for (sig in decrypt_status.signatures) {
                                sig_fp = decrypt_status.signatures[sig].fingerprint;
                                key_request = plugin.getNamedKey(sig_fp);
                                decrypt_status.signatures[sig].public_key = key_request;
                            }
                            //if (!decrypt_status.error && decrypt_status.data.length > 0) {
                                chrome.tabs.sendRequest(sender.tab.id, {'msg': 'insertDecryptedData',
                                    'decrypt_status': decrypt_status, 'original_text':
                                        request.context_menuitems['decrypt'].data});
                            //}
                        }
                     });
                }
                if ("verify" in request.context_menuitems) {
                    chrome.contextMenus.create({
                        "title" : "Verify this text",
                        "contexts" : ["editable"],
                        "type" : "normal",
                        "onclick" : function(info, tab) {
                            data = request.context_menuitems["verify"].data
                            verify_status = plugin.gpgVerify(data);
                            console.log(verify_status);
                            if (!verify_status.error && verify_status.data.length > 0) {
                                chrome.tabs.sendRequest(sender.tab.id, {'msg': 'insertSignedData',
                                    'data': verify_status.data});
                            }
                        }
                    });
                }
                chrome.contextMenus.create({
                    "title" : "Options",
                    "type" : "normal",
                    "contexts" : ["all"],
                    "onclick" : function(info, tab) {
                        chrome.tabs.create({'url': chrome.extension.getURL('options.html'),
                            'index': sender.tab.index + 1});
                    },
                });
                chrome.contextMenus.create({
                    "title" : "Key Manager",
                    "type" : "normal",
                    "contexts" : ["all"],
                    "onclick" : function() {
                        chrome.tabs.create({'url': chrome.extension.getURL('key_manager.html'),
                            'index': sender.tab.index + 1});
                    },
                });
            });
        } else if(request.msg == "delete_menu") {
            chrome.contextMenus.removeAll();
        }
        // Return the response and let the connection be cleaned up.
        sendResponse({'result': response});
    },

    parseUrl: function(url) {
        var re = /^((\w+):\/\/\/?)?((\w+):?(\w+)?@)?([^\/\?:]+):?(\d+)?(\/?[^\?#;\|]+)?([;\|])?([^\?#]+)?\??([^#]+)?#?(\w*)/gi
        result = re.exec(url);
        return { 'url': result[0],
            'proto_full': result[1],
            'proto_clean': result[2],
            'domain': result[6],
            'port': result[7],
            'path': result[8],
            'query': result[11],
            'anchor': result[12]
        }
    },

    gpgGenKeyProgress: function(data) {
        var port = chrome.extension.connect({name: "gpgGenKeyProgress"});
        port.postMessage({"type": "progress", "data": data});
        port.disconnect()
    },

    gpgGenKeyComplete: function(data) {
        var port = chrome.extension.connect({name: "gpgGenKeyProgress"});
        port.postMessage({"type": "progress", "data": data});
        port.disconnect();
        var notification = webkitNotifications.createNotification(
          'images/webpg-48.png',
          'Key Generation Complete',
          'The generation of your new Key is now complete.'
        );
        notification.show();
    },

}

// Listen for the creation of the plugin, and then init webpgBackground
document.addEventListener('DOMContentLoaded', function () {
    webpgBackground.init();
});

// Listen for the content script to send a message to the background page.
chrome.extension.onRequest.addListener(webpgBackground.onRequest);