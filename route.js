
var express = require('express')
var router = express.Router()
var pricingService = require('./service')
const gcp = require("./gcpController")

router.post("/servicePriceJson", (req, res) => {
    pricingService.getPricingInformation(req, res, (err, response) => {
        res.status(200).json(response);
    });
})

module.exports = router;

