var AWS = require('aws-sdk');
var fs = require('fs');
const path = require('path');
var creds = new AWS.FileSystemCredentials(path.join(__dirname, '/awsConfig.json'));
var pricing = new AWS.Pricing({ credentials: creds, region: "us-east-1" });
var _this = this;

const dataFolder = "data";
const servicesFolder = `${dataFolder}/awsServices`;

const createFolder = folderPath => {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath);
    }
}

const removeFolder = folderPath => {
    if (fs.existsSync(folderPath)) {
        fs.rmdirSync(folderPath, { recursive: true });
    }
}

const getCosting = (jsonFile) => {
    let parsedProductList = [];
    let regionsList = new Set();
    let osList = new Set();
    
    if (fs.existsSync(`${servicesFolder}/${jsonFile}.json`)) {
        let fileContent = fs.readFileSync(`${servicesFolder}/${jsonFile}.json`);
        let productsList = JSON.parse(fileContent.toString())

        productsList.forEach((obj) => {
            let product = obj.product;
            let parsedProduct = {
                productFamily : product.productFamily,
                attributes : product.attributes,
                monthlyPrices : {}
            };

            regionsList.add(product.attributes.location);
            osList.add(product.attributes.operatingSystem);

            let onDemandPriceObj = obj.terms.OnDemand;
            for (let offerCode in onDemandPriceObj) {
                let priceDimensionsObj = onDemandPriceObj[offerCode].priceDimensions;
                for (let rateCode in priceDimensionsObj) {
                    let unit = priceDimensionsObj[rateCode].unit;
                    let pricePerUnit = Number(priceDimensionsObj[rateCode].pricePerUnit.USD);
                    if (unit == "Hrs") {
                        parsedProduct.monthlyPrices['onDemand'] = (pricePerUnit * 730).toFixed(2);        //Avg hours per month is 730
                    }
                }
            }

            let reservedPriceObject = obj.terms.Reserved;
            parsedProduct.monthlyPrices['reserved'] = {};
            for (let offerCode in reservedPriceObject) {
                let priceDimensionsObj = reservedPriceObject[offerCode].priceDimensions;
                let termAttributes = reservedPriceObject[offerCode].termAttributes;
                let pricingStrategy = `${termAttributes.OfferingClass}_${termAttributes.LeaseContractLength}_${termAttributes.PurchaseOption}`.replace(' ', '').toLowerCase();
                //console.log(pricingStrategy);
                parsedProduct.monthlyPrices['reserved'][pricingStrategy] = {
                    monthly: 0,
                    upfront: 0
                }
                for (let rateCode in priceDimensionsObj) {
                    let unit = priceDimensionsObj[rateCode].unit;
                    let pricePerUnit = Number(priceDimensionsObj[rateCode].pricePerUnit.USD);
                    if (unit == "Hrs") {
                        parsedProduct.monthlyPrices['reserved'][pricingStrategy]['monthly'] += (pricePerUnit * 730).toFixed(2);
                    } else if (unit == "Quantity") {
                        parsedProduct.monthlyPrices['reserved'][pricingStrategy]['upfront'] = pricePerUnit;
                    }
                }

            }

            //console.log(parsedProduct.attributes.instanceType);
            parsedProductList.push(parsedProduct);

        })
    }
    return {parsedProductList, regionsList, osList};
}

const getAllInstanceTypes = async (filter) => {
    const allAttributes = [];
    const params = {
        AttributeName: "instanceType",
        ServiceCode: "AmazonEC2",
    };

    const getAttrs = async (token) => {
        if(token) {
            params.NextToken = token;
        }

        return pricing.getAttributeValues(params).promise()
            .then(async data => {
                allAttributes.push(...data.AttributeValues);
                if(data.NextToken){
                    return await getAttrs(data.NextToken);
                }

                let filteredAttrs = allAttributes.filter((attr) => attr.Value.startsWith(filter))
                return filteredAttrs;
            })
            .catch(err => {
                console.log(err);
                throw new Error('Error getting all instance types');
            })
    }
    return await getAttrs();
}

const getAllRegions = async (filter) => {
    const allRegions = [];
    const params = {
        AttributeName: "instanceType",
        ServiceCode: "AmazonEC2",
    };

    const getRegions = async (token) => {
        if(token) {
            params.NextToken = token;
        }

        return pricing.getAttributeValues(params).promise()
            .then(data => {
                allRegions.push(...data.AttributeValues);
                if(data.NextToken){
                    return getRegions(data.NextToken);
                }

                return allRegions;
            })
            .catch(err => {
                console.log(err);
                throw new Error('Error getting all regions');
            })
    }
    return getRegions();
}

const getAllOs = async (filter) => {
    const allOs = [];
    const params = {
        AttributeName: "instanceType",
        ServiceCode: "AmazonEC2",
    };

    const getOS = async (token) => {
        if(token) {
            params.NextToken = token;
        }

        return pricing.getAttributeValues(params).promise()
            .then(data => {
                allOs.push(...data.AttributeValues);
                if(data.NextToken){
                    return getOS(data.NextToken);
                }

                return allOs;
            })
            .catch(err => {
                console.log(err);
                throw new Error('Error getting all attributes');
            })
    }
    return getOS();
}

const getProductPricing = async (instanceType, region, os) => {

    let productsList = [];
    const params = {
        Filters: [
            // {
            //     "Type": "TERM_MATCH",
            //     "Field": "location",
            //     "Value": region
            // }, 
            {
                "Type": "TERM_MATCH",
                "Field": "instanceType",
                "Value": instanceType
            }, 
            // {
            //     "Type": "TERM_MATCH",
            //     "Field": "operatingSystem",
            //     "Value": os
            // }, 
            {
                "Type": "TERM_MATCH",
                "Field": "tenancy",
                "Value": "Shared"
            }, {
                "Type": "TERM_MATCH",
                "Field": "capacitystatus",
                "Value": "Used"
            }, {
                "Type": "TERM_MATCH",
                "Field": "preInstalledSw",
                "Value": "NA"
            }
        ],
        ServiceCode: "AmazonEC2"
    };

    // let regionFolder = `${servicesFolder}/${region}`;
    // let osFolder = `${regionFolder}/${os}`;

    //removeFolder(dataFolder);
    createFolder(dataFolder);
    createFolder(servicesFolder);
    // createFolder(regionFolder);
    // createFolder(osFolder);

    const getProducts = async (token) => {
        if (token) {
            params.NextToken = token;
        }

        return pricing.getProducts(params).promise()
            .then(async (data) => {
                productsList.push(...data.PriceList);
                if(data.NextToken){
                    await getProducts(data.NextToken);
                }

                if(productsList.length > 0 && !fs.existsSync(`${servicesFolder}/${instanceType}.json`)) {
                    // const fsStream = fs.createWriteStream(`${servicesFolder}/${instanceType}.json`)
                    // fsStream.write(JSON.stringify(productsList))
                    // fsStream.end();

                    fs.writeFileSync(`${servicesFolder}/${instanceType}.json`, JSON.stringify(productsList))
                }
                // if (data) {
                //     if (data.PriceList.length > 0) {
                //         if (!fs.existsSync(`${servicesFolder}/${instanceType}.json`)) {
                //             const fsStream = fs.createWriteStream(`${servicesFolder}/${instanceType}.json`, { flags: 'a' })
                //             fsStream.write(JSON.stringify(...data.PriceList))
                //         }
                //     }

                //     if (data.NextToken) {
                //         await getProducts(data.NextToken);
                //     }
                // }
            })
            .catch(err => {
                console.log(err);
                throw new Error(`Error getting ${instanceType} product information`);
            })
    }

    await getProducts();
}

exports.getAwsPricing = async (awsInput, cb) => {
    //get Series types
    let inputArgs = {
        series : awsInput.series ? awsInput.series : "",
        os : awsInput.os,
        region : awsInput.region,
        machineType : awsInput.instanceType,
    }

    let allRegionsList = new Set();
    let allOsList = new Set();

    const allInstancePricingValues = {};
    let cheapestAnnualPricingStrategy = {};
    cheapestAnnualPricingStrategy['annualCost'] = 99999999999;
    getAllInstanceTypes(inputArgs.series).then(instanceTypes => {
        let promiseArray = []
        instanceTypes.forEach((instanceType) => {
            //Get Price Information
            promiseArray.push(getProductPricing(instanceType.Value, inputArgs.region, inputArgs.os))
        })

        Promise.allSettled(promiseArray).then(() => {
            instanceTypes.forEach((instanceType) => {
                let tempData = getCosting(instanceType.Value);
                if(tempData.parsedProductList.length > 0) {
                    allRegionsList = new Set([...allRegionsList, ...tempData.regionsList])
                    allOsList= new Set([...allOsList, ...tempData.osList])
                    allInstancePricingValues[instanceType.Value] = tempData.parsedProductList;
                }
            })
            const findCheapestPricing = (pricingArray) => {

                //Identify lowest
                for (let dataObject of pricingArray) {

                    let monthlyPricingObject = dataObject.monthlyPrices;

                    for (let ps in monthlyPricingObject) {
                        let annualCost, monthlyCost, upfrontCost;
                        switch (ps) {

                            case "onDemand":
                                annualCost = Number((Number(monthlyPricingObject[ps]) * 12).toFixed(2));
                                if (annualCost < cheapestAnnualPricingStrategy['annualCost']) {
                                    let tempObject = {
                                        annualCost: annualCost,
                                        monthly: Number(monthlyPricingObject[ps]),
                                        instanceType: dataObject.attributes.instanceType,
                                        os: dataObject.attributes.operatingSystem,
                                        location: dataObject.attributes.location,
                                        pricingStrategy: "On Demand"
                                    }
                                    cheapestAnnualPricingStrategy = tempObject;
                                }
                                break;
                            case "reserved":
                                for (let rps in monthlyPricingObject[ps]) {

                                    monthlyCost = Number(monthlyPricingObject[ps][rps]['monthly']) * 12;
                                    upfrontCost = Number(monthlyPricingObject[ps][rps]['upfront']);
                                    annualCost = Number((monthlyCost + upfrontCost).toFixed(2));
                                    let psDetails = rps.split('_')
                                    if (annualCost < cheapestAnnualPricingStrategy['annualCost']) {
                                        let tempObject = {
                                            annualCost: annualCost,
                                            monthly: Number(monthlyPricingObject[ps][rps]['monthly']),
                                            upfront: Number(monthlyPricingObject[ps][rps]['upfront']),
                                            instanceType: dataObject.attributes.instanceType,
                                            os: dataObject.attributes.operatingSystem,
                                            location: dataObject.attributes.location,
                                            pricingStrategy: `Reserved ${psDetails[0]}`,
                                            reservationTerm: psDetails[1],
                                            paymentType: psDetails[2]

                                        }
                                        cheapestAnnualPricingStrategy = tempObject;
                                    }
                                }
                                break;
                        }
                    }
                }

            }

            if(inputArgs.machineType){
                if(inputArgs.os || inputArgs.region) {
                    let filteredPricingArray = allInstancePricingValues[inputArgs.machineType].filter((obj) => {
                        if(inputArgs.os && inputArgs.region){
                            return (obj.attributes.operatingSystem == inputArgs.os && obj.attributes.location == inputArgs.region)
                        }else if(inputArgs.os) {
                            return (obj.attributes.operatingSystem == inputArgs.os)
                        }else if(inputArgs.region){
                            return (obj.attributes.location == inputArgs.region)
                        }
                    })
                    findCheapestPricing(filteredPricingArray);
                }else {
                    findCheapestPricing(allInstancePricingValues[inputArgs.machineType]);
                }
            } else {
                for(let insType in allInstancePricingValues) {
                    if(inputArgs.os || inputArgs.region) {
                        let filteredPricingArray = allInstancePricingValues[insType].filter((obj) => {
                            if(inputArgs.os && inputArgs.region){
                                return (obj.attributes.operatingSystem == inputArgs.os && obj.attributes.location == inputArgs.region)
                            }else if(inputArgs.os) {
                                return (obj.attributes.operatingSystem == inputArgs.os)
                            }else if(inputArgs.region){
                                return (obj.attributes.location == inputArgs.region)
                            }
                        })
                        findCheapestPricing(filteredPricingArray);
                    }else {
                        findCheapestPricing(allInstancePricingValues[insType]);
                    }
                }
            }
            //Return array and current object
            let priceArray = []
            
            for(let i=1; i<=36; i++){
                priceArray.push({month:i, totalPrice: Number((cheapestAnnualPricingStrategy.monthly * i).toFixed(2))})
            }
            // if(cheapestAnnualPricingStrategy.pricingStrategy == "On Demand"){
                
            // }
            // else {
            //     if(cheapestAnnualPricingStrategy.reservationTerm == "1yr"){

            //     }else if(cheapestAnnualPricingStrategy.reservationTerm == "3yr"){

            //     }
            // }

            cheapestAnnualPricingStrategy['totalPriceArray'] = priceArray;
            cheapestAnnualPricingStrategy['metadata'] = {
                instanceTypes : instanceTypes.map((ins) => ins.Value),
                operatingSystems : Array.from(allOsList),
                regions : Array.from(allRegionsList),
                pricingModels : ["On Demand","Reserved Standard","Reserved Convertible"],
                reservationTerms : ["1 yr","3 yr"],
                paymentOptions : ["No Upfront", "Partial Upfront", "Full Upfront"]
            }
            cb(null,cheapestAnnualPricingStrategy)

        }).catch(err => {
            console.log(err.message);
        })
    })
}


