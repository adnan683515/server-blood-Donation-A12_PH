// Importing required modules
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();             // Loads environment variables from .env file
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
var admin = require("firebase-admin"); //token verify korar jonno firebase use kortesi 

const app = express();
const port = process.env.PORT || 5000;

// Middleware setup
app.use(cors());
app.use(express.json());

var serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


const uri = `mongodb+srv://${process.env.db_name}:${process.env.db_pass}@cluster0.ws0fker.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Todo : 
// . Jwt
// .roleMiddle ware (Admin,donor,volunteer)
// .deploy





async function run() {
    try {

        // await client.connect();

        const db = client.db('bloodDonation'); //create database
        const userCollections = db.collection('users'); // create a user collections
        const DonationRequestCollections = db.collection('donationRequest')

        const ConfirmedCollections = db.collection('confirmedRequest')
        const BlogCollections = db.collection('Blogs')
        const fundCollections = db.collection('funds')

        const jwtToken = async (req, res, next) => {
            const verifyApiInfo = { ...req?.query }
            const keyOfObj = verifyApiInfo && Object.keys(verifyApiInfo)[0]
            const ValueOfObj = verifyApiInfo && Object.values(verifyApiInfo)[0]
            if (keyOfObj === 'all' && ValueOfObj === 'data') {
                next()
            }
            else {
                const headers = req?.headers?.authorization
                if (!headers) {
                    return res.status(401).json({ message: 'Unauthorized: No token provided' });
                }
                const token = headers.split(' ')[1]
                try {
                    //
                    const decodedToken = await admin.auth().verifyIdToken(token);
                    req.decodedEmail = decodedToken; // attach decoded user info to request
                    next(); // proceed
                }
                catch {
                    return res.status(401).json({ message: 'Unauthorized: No token provided' });
                }


            }

        }
        const adminVerify = async (req, res, next) => {
            const email = req?.decodedEmail?.email;

            if (!email) {
                return res.status(401).json({ message: "Unauthorized. No email found in token." });
            }
            try {
                const result = await userCollections.findOne({ email: email });
                if (!result || result?.status !== 'Admin') {
                    return res.status(403).json({ message: "Forbidden. Admins only." });
                }
                next();

            } catch (err) {
                console.error(err);
                return res.status(500).json({ message: "Server error" });
            }
        }


        const Getrole = async (email) => {
            const result = await userCollections.findOne({ email: email })
            return result?.role
        }



        // Create payment intent
        app.post('/create-payment-intent', jwtToken, async (req, res) => {
            const { amount } = req.body;

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount,
                    currency: 'usd',
                    payment_method_types: ['card'],
                });
                res.send({
                    clientSecret: paymentIntent.client_secret,
                });
            } catch (error) {
                res.status(400).send({ error: error.message });
            }
        });

        //save data when user donate fund
        app.post('/saveDataWhenPayment', jwtToken, async (req, res) => {
            const information = req?.body
            try {
                const result = await fundCollections.insertOne(information)
                res.send(result)
            } catch (err) {
                //
                res.send(err.message)
            }
        })


        //save doner when user registrations
        app.post('/user', async (req, res) => {
            const info = req?.body
            try {
                const result = await userCollections.insertOne(info)
                res.send(result)
            }
            catch {
                res.send({ msg: "user data doesn't save" })
            }
        })

        //get donor when user will be search
        app.get('/donor', jwtToken, async (req, res) => {


            console.log("kire mama")
            const { blood, upazila, district, role, email } = req.query;
            const query = { blood, upazila, district, role, email: { $ne: email } }


            try {
                const result = await userCollections.find(query).toArray()
                res.send(result)
            }
            catch {
                res.send({ msg: "donor pawya jai nai" })
            }


        })
        //save donation request 
        app.post('/dontaionRequest', jwtToken, async (req, res) => {

            const inforamtion = req?.body
            try {
                const result = await DonationRequestCollections.insertOne(inforamtion)
                res.send(result)
            }
            catch {
                res.send({ msg: "DonationRequestCollections save hocce na" })
            }

        })
        // "Get donation request data using specific donor"
        app.get('/loadDontaionRequest', jwtToken, async (req, res) => {

            const all = req?.query?.all
            if (all) {
                try {
                    const result = await DonationRequestCollections.find({ status: 'pending' }).toArray()
                    res.send(result)
                }
                catch {
                    res.send({ msg: "donor pawya jai nai" })
                }
                return
            }

            const email = req?.query?.email
            if (email !== req?.decodedEmail?.email) {
                return res.status(401).json({ message: 'Unauthorized: No token provided' });
            }
            const getRole = await Getrole(email)
            if (getRole === 'Admin') {
                return res.status(401).json({ message: 'Unauthorized: No token provided' });
            }
            const query = {}
            if (email) {
                try {
                    query.requesterEmail = email
                    const result = await DonationRequestCollections.find(query).sort({ createdAt: -1 }).limit(3).toArray()
                    res.send(result)
                }
                catch (error) {
                    res.send(error)
                }
            }
        })

        //get donationREquest all Data for specific donor  
        app.get('/LoadAllDonationMyRequest', jwtToken, async (req, res) => {
            const email = req?.query?.email

            if (email !== req?.decodedEmail?.email) {
                return res.status(401).json({ message: 'Unauthorized: No token provided' });
            }
            const getRole = await Getrole(email)
            if (getRole === 'Admin') {
                return res.status(401).json({ message: 'Unauthorized: No token provided' });
            }
            const query = {}

            try {
                query.requesterEmail = email
                const result = await DonationRequestCollections.find(query).sort({ createdAt: -1 }).toArray()

                res.send(result)
            }
            catch (error) {
                res.send(error)
            }

        })

        //get details user from usercollections
        app.get('/userdata', jwtToken, async (req, res) => {
            const email = req?.query?.email
            if (email !== req?.decodedEmail?.email) {
                return res.status(401).json({ message: 'Unauthorized: No token provided' });
            }
            const query = {}
            try {
                if (query) {
                    query.email = email
                    const result = await userCollections.findOne(query)
                    res.send(result)
                }
            }
            catch (error) {
                res.send(error)
            }
        })

        //patch user update data 
        app.patch('/updateprofile', jwtToken, async (req, res) => {
            const updateInfo = req?.body
            const { email, upazila, blood, image, district } = updateInfo
            const query = { email }
            const document = {
                $set: {
                    blood: blood,
                    district: district,
                    upazila: upazila,
                    image: image
                }
            }
            const result = await userCollections.updateOne(query, document)
            res.send(result)
        })

        //get details donation request 
        app.get('/detailsrequest/:id', jwtToken, async (req, res) => {
            const id = req?.params?.id
            const query = { _id: new ObjectId(id) }
            try {
                const result = await DonationRequestCollections.findOne(query)
                res.send(result)
            }
            catch (error) {
                console.log(error)
            }
        })

        //patch request from client side  donation Request pending to inprogress
        app.patch('/donationRequestUpdate/:id/:status', jwtToken, async (req, res) => {
            const id = req?.params?.id
            const sta = req?.params?.status
            const query = { _id: new ObjectId(id) }

            try {
                const document = {
                    $set: {
                        status: sta
                    }
                }
                const result = await DonationRequestCollections.updateOne(query, document)
                res.send(result)

            }
            catch (error) {
                //
                res.send(error)
            }
        })

        //get all donors  , users , volunteer , and Total request
        app.get('/allDonors', jwtToken, async (req, res) => {

            const adminemail = req?.query?.email
            if (req?.decodedEmail?.email !== adminemail) {
                return res.status(401).send({ msg: 'unauthorized Token' })
            }
            const verifyAdmin = await Getrole(adminemail)
            if (verifyAdmin === 'Donor') {
                return res.send({ msg: "this api only see admin" })
            }

            const user = await userCollections.find({ email: { $ne: adminemail } }).toArray()
            const result = await userCollections.find({ role: 'Donor' }).toArray()
            const volunteer = await userCollections.find({ role: 'Volunteer' }).toArray()
            const request = await DonationRequestCollections.find().toArray()
            res.send({ donors: result?.length, volunteer: volunteer?.length, user: user?.length, request: request?.length })
        })


        //save data when user(Donor) click on the confirmed button
        app.post('/confirmedReq', jwtToken, async (req, res) => {
            const info = req?.body
            try {
                const result = await ConfirmedCollections.insertOne(info)
                res.send(result)
            }
            catch (err) {
                console.log(err)
            }
        })

        //get data from confirmed collections using by DonationRequest Id
        app.get('/confirmedReq/:id', async (req, res) => {
            const donatonReqId = req?.params?.id
            try {
                const query = { DonationRequest: donatonReqId }
                const result = await ConfirmedCollections.findOne(query)
                res.send(result)
            }
            catch (er) {
                console.log(er)
            }
        })

        //get all user data 
        app.get('/AllUsersData', jwtToken, async (req, res) => {
            const email = req?.query?.email
            if (req?.decodedEmail?.email !== email) {
                return res.status(401).send({ msg: 'unauthorized user' })
            }
            const getRole = await Getrole(email)

            if (getRole !== 'Admin') {
                return res.status(401).send({ msg: 'unauthorized user' })
            }
            const result = await userCollections.find({ email: { $ne: email } }).toArray()
            res.send(result)
        })

        //patch user role Active to Block
        app.patch('/userRoleupdate/:userId/:status', jwtToken, async (req, res) => {

            try {
                const userid = req?.params?.userId
                const stutus = req?.params?.status
                const query = { _id: new ObjectId(userid) }
                if (stutus === 'Active' || stutus === 'Blocked') {
                    const documnet = {
                        $set: {
                            status: stutus
                        }
                    }
                    const result = await userCollections.updateOne(query, documnet)

                    return res.send(result)
                }
                else {

                }

                const documnet = {
                    $set: {
                        role: stutus
                    }
                }
                const result = await userCollections.updateOne(query, documnet)

                res.send(result)
            }
            catch (err) {
                console.log(err)
            }
        })


        //All  Donation  Request For Admin 
        app.get('/allRequestList/:email', jwtToken, async (req, res) => {
            const email = req?.params?.email
            if (req?.decodedEmail.email !== email) {
                return res.status(401).send({ msg: 'this api only admin' })
            }
            const verifyAdmin = await Getrole(email)

            if (verifyAdmin === 'Donor') {
                return res.status(401).send({ msg: 'this api only admin' })
            }
            const lmt = req?.params?.lim
            const skp = req?.params?.skp

            const result = await DonationRequestCollections.find().toArray()
            return res.send(result)
        })

        //delete donation Request 
        app.delete('/deleteRequest/:id', jwtToken, async (req, res) => {
            const id = req?.params?.id
            const query = { _id: new ObjectId(id) }
            const result = await DonationRequestCollections.deleteOne(query)
            res.send(result)
        })

        //add blog content
        app.post('/addBlog', jwtToken, async (req, res) => {

            const blogInfo = req?.body
            const { email } = blogInfo
            if (req?.decodedEmail?.email !== email) {
                return res.status(401).send({ msg: "aunthorized user" })
            }

            const result = await BlogCollections.insertOne(blogInfo)
            res.send(result)
        })

        //get draft blog post and publish blog post just this api admin and volunteer
        app.get('/blogpost', async (req, res) => {
            const statustype = req?.query?.statustype
            const result = await BlogCollections.find({ status: statustype }).toArray()
            res.send(result)
        })



        // blog status update published or Draft
        app.patch('/blogStatusUpdate/:id/:status', jwtToken, async (req, res) => {
            const status = req?.params?.status
            const id = req?.params?.id
            const query = { _id: new ObjectId(id) }
            const updateOne = {
                $set: {
                    status: status
                }
            }
            const result = await BlogCollections.updateOne(query, updateOne)
            res.send(result)
        })

        //blog Delete 
        app.delete('/blogDelete/:id', jwtToken, async (req, res) => {
            const id = req?.params?.id
            const query = { _id: new ObjectId(id) }
            const result = await BlogCollections.deleteOne(query)
            res.send(result)
        })

        //get fund api 
        app.get('/loadFund', jwtToken, async (req, res) => {
            const result = await fundCollections.find().toArray()
            res.send(result)
        })

        //blog details 
        app.get('/showBlogDetails/:id', async (req, res) => {
            const id = req?.params?.id
            const query = { _id: new ObjectId(id) }

            const result = await BlogCollections.findOne(query)

            res.send(result)
        })


        //put request 

        app.put('/donationRequestUpdate', jwtToken, async (req, res) => {
            const info = req.body;
            const { id } = info;
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: info
            };
            const result = await DonationRequestCollections.updateOne(query, updatedDoc);
            res.send(result);
        });

      
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);






// Basic route (for testing if server is working)
app.get('/', (req, res) => {
    res.send('Server is running!');       // Sends response on GET /
});

// Starts the server
app.listen(port, () => {
    console.log(`Server is listening on port ${port}`); // Logs when server starts
});
