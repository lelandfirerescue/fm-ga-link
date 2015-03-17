/* Copyright (c) 2015 Leland Volunteer Fire/Rescue Department, Inc.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/** ReconcileUsers.gs - Ensures a Google Apps Group is in sync with FireManager
 * @author Christopher Watford <christopher.watford@lelandfirerescue.com>
 * 
 * Required Script Properties:
 * 
 * FM_ACCID - FireManager `accid` for their API
 * FM_ACCKEY - FireManager `acckey` for their API
 * FM_CUSID - FireManager `cusid` for their API
 * GA_GROUP_EMAIL - Google Apps group email address to manage
 * GA_REPORT_EMAIL - Email address to receive reports regarding group management
 * 
 * Default Implementation Script Properties:
 * 
 * FM_EMPLOYEE_TYPES - Comma separated list of "Employee Types" to add
 *                     to the Google group address.
 */

var FireManager = function () {
  this._endpoint = "https://secure2.aladtec.com/api/index.php";
};

FireManager.prototype.getMembersPayload = function () {
  // CAW: leave these as properties so that if you share the source
  // of your script you do not leak your private properties!
  var props = PropertiesService.getScriptProperties();
  var _accid = props.getProperty("FM_ACCID");
  var _acckey = props.getProperty("FM_ACCKEY");
  var _cusid = props.getProperty("FM_CUSID");
  return "accid=" + _accid
       + "&acckey=" + _acckey
       + "&cusid=" + _cusid
       + "&cmd=getMembers&ia=all";
  // ?accid=449543&acckey=J398NJT798U40CC0K2GYR4Z1I3D7TLYE&cusid=99876&cmd=getMembers
};

FireManager.prototype.requestUsersXml = function () {
  var options = {
    method: "post",
    payload: this.getMembersPayload()
  };
  
  var response = UrlFetchApp.fetch(this._endpoint, options);
  var xml = response.getContentText();
  var xdoc = XmlService.parse(xml);
  return xdoc;
};

FireManager.createMemberFromXml = function (xmember) {
  var member = { };
  
  var xattrs = xmember.getChild("attributes").getChildren("attribute");
  for (var ii = 0; ii < xattrs.length; ++ii) {
    var xattr = xattrs[ii];
    if (xattr) {
      if (!xattr.getAttribute("key")) continue;
      if (!xattr.getChild("value")) continue;

      var attr = xattr.getAttribute("key").getValue().trim();
      var value = xattr.getChild("value").getText().trim();
    
      member[attr.toLowerCase()] = value;
    }
  }
  
  // CAW: done last to overwrite any 'name' attribute
  member.name = xmember.getChild("name").getText().trim();
  return member;
}

FireManager.prototype.getUsers = function (checkUser) {
  var members = { };
  
  var xdoc = this.requestUsersXml();
  var xroot = xdoc.getRootElement();
  
  var xmembers = xroot.getChild("members").getChildren("member");
  for (var ii = 0; ii < xmembers.length; ++ii) {
    var member = FireManager.createMemberFromXml(xmembers[ii]);
    if (checkUser(member)) {
      if (member.email) {
        members[member.email.toLowerCase()] = member;
      }
    }
  }
  
  return members;
}

var GroupManager = function (group) {
  this._group = group;
}

GroupManager.prototype.getUsers = function () {
  return AdminDirectory.Members.list(this._group).members;
}

GroupManager.prototype.deleteUser = function (email) {
  var deleted = false;
  try {
    AdminDirectory.Members.remove(this._group, email);
    Logger.log("Removed %s from %s", email, this._group);
    deleted = true;
  }
  catch (ex) {
    Logger.log("Could not remove %s from %s", email, this._group);
    Logger.log("%s", ex);
  }
  
  return deleted;
}

GroupManager.prototype.addUser = function (email) {
  var added;
  try {
    added = AdminDirectory.Members.insert({ email: email, role: "MEMBER" }, this._group);
    Logger.log("Added %s to %s", email, this._group);
  }
  catch (ex) {
    Logger.log("Could not add %s to %s", email, this._group);
    Logger.log("%s", ex);
  }

  return added;
}

function ReconcileUsers() {
  var existingUsers = { },
      added = [],
      updated = {},
      removed = [];
      
  var props = PropertiesService.getScriptProperties();
  var _googleGroup = props.getProperty("GA_GROUP_EMAIL");
  var _fmEmpTypes = props.getProperty("FM_EMPLOYEE_TYPES").split(',');
  var _reportEmail = props.getProperty("GA_REPORT_EMAIL");
  
  // 1. Get users from GA
  var GA = new GroupManager(_googleGroup);
  var _gaUsers = GA.getUsers();
  for (var ii = 0; ii < _gaUsers.length; ++ii) {
    var user = _gaUsers[ii];
    Logger.log("User %s is a %s of '%s'", user.email, user.role, _googleGroup);
    
    existingUsers[user.email.toLowerCase()] = user;
  }
  
  // 2. Get users from FM
  var FM = new FireManager();
  
  /** IMPLEMENTOR'S NOTE:
   *  The predicate passed to `getUsers()` is what you should update
   *  to select users. The current method presumes you have an 'employee_type'
   *  attribute returned by the FireManager API.
   */
  var _fmUsers = FM.getUsers(function (member) {
    return !_fmEmpTypes || _fmEmpTypes.indexOf(member.employee_type) >= 0;
  });
  
  // 3. Add new users to GA
  for (var email in _fmUsers) {
    if (_fmUsers.hasOwnProperty(email)) {
      var user = _fmUsers[email];
      if (existingUsers.hasOwnProperty(email)) {
        Logger.log("User %s already exists in '%s'", email, _googleGroup);
      }
      else {
        var addedUser = GA.addUser(email);
        if (addedUser) {
          added.push(email);
          // CAW: sometimes users get added to a Google Group with an @gmail.com email
          // address, but actually have some other google email (such as @googlemail.com).
          // This allows us to test for those users and report it back to the administrator
          // so they can update their email in FireManager.
          if (addedUser.email.toLowerCase() != email) {
            Logger.log("User %s already exists in '%s' but under %s", email, _googleGroup, addedUser.email);
            updated[email] = addedUser.email;
          }
        }
      }
    }
  }
  
  // 4. Remove unused users from GA
  for (var email in existingUsers) {
    if (existingUsers.hasOwnProperty(email)
     && !_fmUsers.hasOwnProperty(email)) {
      // CAW: we only sync MEMBERS not OWNERS, this avoids DoS/escalation problems
      if (existingUsers[email].role == "MEMBER") {
        if (!updated.hasOwnProperty(email)) {
          Logger.log("User %s exists in GA but not FM, removing", email);
          if (GA.deleteUser(email)) {
            removed.push(email);
          }
        }
        else {
          Logger.log("User %s exists in GA and in FM, but their address is listed as %s in FM", updated[email], email);
        }
      }
    }
  }
  
  // 5. Send the report
  if (added.length || removed.length) {
    var body = _googleGroup + ' Mailing List Update Logs\n\nThe following is the list of changes from the nightly'
             + ' run of the "ReconcileUsers" process.\n\n'
             + 'Added:\n'
             + added.join('\n')
             + '\nRemoved:\n'
             + removed.join('\n');
    
    var updatedBody;
    for (var u in updated) {
      if (updated.hasOwnProperty(u) && added.indexOf(u) >= 0) {
        if (!updatedBody) {
          updatedBody = '\nThe following users have mismatched emails (please update in FM):';
        }
        
        updatedBody += '\n' + updated[u] + ' is listed in FM as ' + u;
      }
    }
    
    if (updatedBody) body += updatedBody;
    
    MailApp.sendEmail(_reportEmail, '[Nightly] ' + _googleGroup + ' Mailing List Update', body);
  }
}
