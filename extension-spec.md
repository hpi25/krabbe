i want to rewrite the current browser extension to be easier to use, better maintainable and less buggy.
The extesion should have the functionality to
- connect to multiple krabbe sportlich instances (not only krabbe.hpi.church)
- connect to multiple calDav calender
- have config to set defaults for respecting all day events and enabling/disabling calenders in a 
  config menue


For that the extension should use a service worker that handles requests from the website. The website
provides the ui but only shows it if the service worker (the extension) is present. The extension should
only bring its own ui where you can configure the mentioned settings.

The Website should include a button to open the extensions config and a button to open a modal where
you can select wich calenders should be respected (based on defaults).
The idea of the extension is to remove allready selected fields that overlap with events in calenders
(like a bridge to calDav). Irrelevant information like name of the event, etc. should NEVER leave the
extension! Only the start and endtime of events should be accessible outside of the extension.
