
var express = require('express')
var router = express.Router()
var pricingService = require('./service')
var provision = require('./provision')
const gcp = require("./gcpController")

router.post("/servicePriceJson", (req, res) => {
    pricingService.getPricingInformation(req, res, (err, response) => {
        if(err) {
            console.log(err);
            res.status(400).send(err.message);
        }
        res.status(200).json(response);
    });
})

router.post("/provision", (req, res) => {
    provision.gcp(req, res, (err, response) => {
        if(err) {
            console.log(err);
            res.status(400).send(err.message);
        }
        res.status(200).json(response);
    });
})

router.get("/", (req, res) => {
    res.status(200).json('OK');
})


module.exports = router;

