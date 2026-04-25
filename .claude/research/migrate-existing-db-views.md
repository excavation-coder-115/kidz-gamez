# Migrate Existing DB Views

## Problem

AppSheet apps can bring in database views; not just static tables. We currently assume any datasource is a table and create it in our database as such. Ideally, we would be able to create the existing views as views in our database as well and use them in the app. There is nothing in the app manifests that indicates that the datasource is a view or whether that view is an editable view (essentially a base table), so we will need to create a UI in the web app or in the chrome extension to enable users to review and modify how the tables get extracted from the manifest. A user should be able to select a table (from their existing appsheet app) and specify that as a view instead of a table. They will also need to specify the exact query for this view as well as the dialect of their current database so that we can generate the correct postgres query for creating that view in our database.

## Solution

PLEASE FILL OUT

## Implementation

PLEASE FILL OUT