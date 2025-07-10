# Daily routines

This repository is a simple web service to supply "daily routines".
It is like a TODO-list management system, but list items are not
a single-shot one but routines refreshed daily, like "take the bath"
or "brush teeth".  Good to keep track of it for your children.

# basic architecture

This project would be supplied through Firebase hosting and functions.
Backend features and semantics are fulfilled through Firebase functions,
and then the frontend features are through hosting.  The data should
be stored into firebase.

# The data model

The central part of the data model is the "routines list". It will
have a name, the list of the routine task items, and the list of
admins. Also it should keep track of the time zone where the admins
reside to keep track of the refresh timing (see below).

Each routine task has the description (i.e. things to do), its
status (finished or not), and then the time it's refreshed; when
refreshed, the status will be back to non-finished automatically.
It does not have to keep track of the history of done or not done.

An admin is a user, tracked by an email. The admin has the control
to edit the list (add/remove/modeify) as well as to update the
finished status of individual routines.

# Periodic refresh

The backend should have a handler which will be invoked periodically
(e.g. each hour), and then check if each routine task reaches the
refresh timing, and update the status.

I'm not sure if this cron-like job management is in Firebase feature.
If not, use GCP's cron feature to kick the firebase handler.

# The frontend

The frontend would be a simple HTML/CSS/Javascript which supports
the following features:
- list-view of the list of routine lists that the user can access to.
  also should have the ability to create a new routine list and
  delete one.
- the view of the routine list; it has the ability to list/modify/
  add/remove/status-update individual routine.  The list of
  routines should be sorted in a way that non-finished tasks
  appear earlier.  Also it should have the invidation button
  which can add an email as an admin of this list.  This page
  should not be accessible publicly or to non-admin users.
