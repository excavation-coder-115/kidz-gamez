# Pagination Optimization

## Problem

Currently, the app is paginating the data using the `limit` and `offset` parameters. This is not efficient because it requires the database to fetch all data up until the offset and then limit the result. We should rather use the designation of some sort of pagination key that can be indexed and ordered. Then we can use the pagination key to fetch the next page of data by indicating a > or < operator to determine the next n rows to fetch.

## Solution

PLEASE FILL OUT

## Implementation

PLEASE FILL OUT