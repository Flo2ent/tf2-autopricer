const ReconnectingWebSocket = require("reconnecting-websocket");
const ws = require("ws");
const fs = require("fs");
const path = require("path");

/**
 * Logs WebSocket events to a file with timestamp
 * @param {string} logFile - Path to the log file
 * @param {string} message - Message to log
 */
function logWebSocketEvent(logFile, message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

/**
 * Initialize the BackpackTF WebSocket connection
 * @param {Object} config - Configuration object
 * @param {Function} config.getAllowedItemNames - Function that returns Set of allowed item names
 * @param {Object} config.schemaManager - TF2 Schema manager instance
 * @param {Object} config.Methods - Methods helper object
 * @param {Function} config.insertListing - Function to insert a listing into DB
 * @param {Function} config.deleteRemovedListing - Function to delete a listing from DB
 * @param {string[]} config.excludedSteamIds - Array of Steam IDs to exclude
 * @param {string[]} config.excludedListingDescriptions - Array of listing descriptions to exclude
 * @param {Object} config.blockedAttributes - Object mapping attribute names to float values
 * @param {string} config.logFile - Path to WebSocket log file
 * @returns {Object} WebSocket connection instance
 */
function initBptfWebSocket({
  getAllowedItemNames,
  schemaManager,
  Methods,
  insertListing,
  deleteRemovedListing,
  excludedSteamIds,
  excludedListingDescriptions,
  blockedAttributes,
  logFile,
}) {
  const rws = new ReconnectingWebSocket(
    "wss://ws.backpack.tf/events/",
    undefined,
    {
      WebSocket: ws,
      headers: {
        "batch-test": true,
      },
    }
  );

  /**
   * Process an individual WebSocket event
   * @param {Object} e - The WebSocket event object
   * @param {string} e.event - Event type ('listing-update' or 'listing-delete')
   * @param {Object} e.payload - Event payload containing listing details
   * @private
   */
  function handleEvent(e) {
    if (!e.payload || !e.payload.item || !e.payload.item.name) {
      // Optionally log ignored events for debugging:
      console.log("[WebSocket] Ignored event:", e);
      return;
    }
    if (getAllowedItemNames().has(e.payload.item.name)) {
      let response_item = e.payload.item;
      let steamid = e.payload.steamid;
      let intent = e.payload.intent;
      switch (e.event) {
        case "listing-update":
          console.log(
            "[WebSocket] Recieved a socket listing update for : " +
              response_item.name
          );

          let currencies = e.payload.currencies;
          let listingDetails = e.payload.details;
          let listingItemObject = e.payload.item;

          if (!e.payload.userAgent) return;
          if (!Methods.validateObject(currencies)) return;

          if (
            listingItemObject.attributes &&
            listingItemObject.attributes.some((attribute) => {
              return (
                typeof attribute === "object" &&
                attribute.float_value &&
                Object.values(blockedAttributes)
                  .map(String)
                  .includes(String(attribute.float_value)) &&
                !Object.keys(blockedAttributes).some((key) =>
                  response_item.name.includes(key)
                )
              );
            })
          ) {
            return;
          }

          currencies = Methods.createCurrencyObject(currencies);

          if (!excludedSteamIds.some((id) => steamid === id)) {
            if (
              listingDetails &&
              !excludedListingDescriptions.some((detail) =>
                new RegExp(`\\b${detail}\\b`, "i").test(
                  listingDetails.normalize("NFKD").toLowerCase().trim()
                )
              )
            ) {
              try {
                var sku = schemaManager.schema.getSkuFromName(
                  response_item.name
                );
                if (sku === null || sku === undefined) {
                  throw new Error(
                    `| UPDATING PRICES |: Couldn't price ${response_item.name}. Issue with retrieving this items defindex.`
                  );
                }
                insertListing(response_item, sku, currencies, intent, steamid);
              } catch (e) {
                console.log(e);
                console.log(
                  "Couldn't create a price for " + response_item.name
                );
              }
            }
          }
          break;
        case "listing-delete":
          console.log(
            "[WebSocket] Recieved a socket listing delete for : " +
              response_item.name
          );

          try {
            deleteRemovedListing(steamid, response_item.name, intent);
          } catch (e) {
            return;
          }
          break;
      }
    }
  }

  rws.addEventListener("open", (event) => {
    const msg = "[WebSocket] Connected to bptf socket.";
    console.log(msg);
    logWebSocketEvent(logFile, msg);
  });

  rws.addEventListener("close", (event) => {
    const msg = `[WebSocket] bptf Socket connection closed. ${event.reason || ""}`;
    console.warn(msg);
    logWebSocketEvent(logFile, msg);
  });

  rws.addEventListener("error", (event) => {
    const msg = `[WebSocket] bptf Socket encountered an error: ${event.message || event}`;
    console.error(msg);
    logWebSocketEvent(logFile, msg);
  });

  rws.addEventListener("message", (event) => {
    var json = JSON.parse(event.data);
    if (json instanceof Array) {
      let updateCount = 0;
      let deleteCount = 0;
      json.forEach((ev) => {
        if (ev.event === "listing-update") updateCount++;
        else if (ev.event === "listing-delete") deleteCount++;
      });
      console.log(
        `[WebSocket] Received batch: ${json.length} events (${updateCount} updates, ${deleteCount} deletions)`
      );
      json.forEach(handleEvent);
    } else {
      console.log(`[WebSocket] Received single bptf event`);
      handleEvent(json);
    }
  });

  return rws;
}

module.exports = { initBptfWebSocket };
