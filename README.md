# fm-ga-link
Provides a link between FireManager and Google Apps to ensure a Group Email is up-to-date.

## Introduction
**fm-ga-link** is a Google Apps Script intended to be used to synchronize a Google Group
with a list of users from Aladtec's FireManager database. This script assumes you have
a single group email which can be mapped to users in your FireManager database by some
attribute (e.g. employee type). End-users of these products wishing to use this script
will need to be familiar with both Google Apps and FireManager's REST-ful API.

## Pre-Requisites
1. Aladtec FireManager API keys (`accid`, `acckey`, and `cusid`)
2. Google Apps for Business Account

## Installation

### FireManager Prerequisites
1. At a minimum, request API access to the `email` attribute from Aladtec support.
2. Request any additional attributes you will need to determine which user should go into the group.
 
### Google Apps Script
3. Log into **Google Drive** with your Google Apps account.
4. Click on the "Create" button
   a. If "Script" is not a menu item, click the "Connect more apps" link
   b. Search for "google apps script"
   c. Click the "+ CONNECT" button for "Google Apps Script"
5. Click on the "Script" menu item
6. Click on the "Blank Project" item
7. Copy `ReconcileUsers.gs` from this repo and replace the contents entirely of `Code.gs`
8. Rename `Code.gs` to `ReconcileUsers.gs` in Google Script by clicking the down arrow menu on the left panel
9. Rename your project by clicking on "Untitled Project"

### Admin SDK Access
10. Click on the "Resources" menu
11. Click on the "Advanced Google Services..." menu item
12. Enable the **Admin Directory API** by clicking the on-off toggle until it reads "on"
13. At the bottom of this dialog click on the "Google Developers Console" link
14. This will bring up a new tab or window for the **Google Developers Console**
15. Find **Admin SDK** and click on the "OFF" button to change the status to "ON"
16. Close the **Google Developers Console** tab or window and return to the previous tab or window
17. At the bottom of the **Advanced Google Services** dialog click "OK"

### Script Properties
18. Click on the "File" menu
19. Click on the "Project properties" menu item
20. Click on the "Script properties" tab
21. Click on the "+Add row" link
22. Add the property `FM_ACCID` with the value of your `accid` given to you by Aladtec
23. Click on the "+Add row" link
24. Add the property `FM_ACCKEY` with the value of your `acckey` given to you by Aladtec
25. Click on the "+Add row" link
26. Add the property `FM_CUSID` with the value of your `cusid` given to you by Aladtec
27. Click on the "+Add row" link
28. Add the property `GA_GROUP_EMAIL` with the email address of the Google Group being managed
29. Click on the "+Add row" link
30. Add the property `GA_REPORT_EMAIL` with the email address to send notifications when the Google Group is changed.
31. Click on the "Save" button

### Triggering
32. Click on the "Resources" menu
33. Click on the "Current project's triggers" menu item
34. Click on the "No triggers set up. Click here to add one now" link
35. Under "Run" select "ReconcileUsers"
36. Under "Events" select "Time-driven", "Day timer", "Midnight to 1am"
37. Click on the "notifications" link
38. Ensure the contact email address is correct.
39. Change "daily" to "immediately"
40. Click on the "OK" button
41. Click on the "Save" button

### Customizing the Implementation
The stock `ReconcileUsers` function contains logic to select users based on their "Employee Type"
attribute found in the FireManager database, however, any criteria could be used. To retain the
stock behavior follow the steps to add a new *Script Property* called `FM_EMPLOYEE_TYPES` with
a comma separated value of desired employee types. The code in question which selects suitable
members from the FireManager database is found within `ReconcileUsers` and looks like:

```js
/** IMPLEMENTOR'S NOTE:
 *  The predicate passed to `getUsers()` is what you should update
 *  to select users. The current method presumes you have an 'employee_type'
 *  attribute returned by the FireManager API.
 */
var _fmUsers = FM.getUsers(function (member) {
  return !_fmEmpTypes || _fmEmpTypes.indexOf(member.employee_type) >= 0;
});
```
An example of a custom implementation could be that users should be added to the group if
their email address is from an approved domain (such as `@ourdomain.com`):

```js
var _fmUsers = FM.getUsers(function (member) {
  return /@ourdomain.com$/.test(member.email)
});
```

## Debugging
A [POSTMAN Collection](http://www.getpostman.com/) is included in this repo which you can use to debug the
responses from the Aladtec REST API. Be sure to set your `accid`, `acckey`, and `cusid` correctly
before running it. Also remember to never share those values.
