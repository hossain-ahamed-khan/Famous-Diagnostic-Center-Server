const express = require('express');
const app = express();
const cors = require("cors");
var jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

// middleware 
app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://diagnostic-center-9996e.web.app",
        "https://diagnostic-center-9996e.firebaseapp.com",
    ]
}));
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.r0xwjyk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const testCollection = client.db("diagnostic_centerDB").collection("tests");
        const userCollection = client.db("diagnostic_centerDB").collection("users");
        const bannerCollection = client.db("diagnostic_centerDB").collection("banner");
        const bookedTestCollection = client.db("diagnostic_centerDB").collection("bookedTests");
        const testResultCollection = client.db("diagnostic_centerDB").collection("testResults");


        // jwt related api 
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        })

        // middlewares - verify token
        const verifyToken = (req, res, next) => {

            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const tokenSplited = req.headers.authorization.split(' ');
            const token = tokenSplited[1];

            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' });
                }
                req.decoded = decoded;
                next();
            })
        }

        // middlewares - verify admin 
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);

            const isAdmin = user?.role === "admin";
            if (!isAdmin) {
                return res.status(403).send({ message: "forbidden access" });
            }
            next();
        }


        // user related api 
        app.get("/users/admin/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: "forbidden access" });
            }
            const query = { email: email }
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }

            res.send({ admin });

        })

        app.get("/loggedUser/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await userCollection.findOne(query);
            res.send(result);
        })

        app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.post("/users", async (req, res) => {
            const user = req.body;
            const result = await userCollection.insertOne(user);
            res.send(result);
        })

        app.patch("/users/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: "admin"
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })


        // test related api 
        app.get("/tests", async (req, res) => {
            const result = await testCollection.find().toArray();
            res.send(result);
        })

        app.get("/testResults/:email", verifyToken, async (req, res) => {
            const query = { email: req.params.email };
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const result = await testResultCollection.find(query).toArray();
            res.send(result);
        })

        app.get("/bookedTests/:email", verifyToken, async (req, res) => {
            const query = { email: req.params.email };
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const result = await bookedTestCollection.find(query).toArray();
            res.send(result);
        })

        app.delete("/bookedTests/:id", verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await bookedTestCollection.deleteOne(query);
            res.send(result);
        })

        app.get("/tests/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await testCollection.findOne(query);
            res.send(result);
        })

        app.get("/reservations", verifyToken, verifyAdmin, async (req, res) => {
            const result = await bookedTestCollection.find().toArray();
            res.send(result);
        })

        app.post("/submit-result/:id", verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await testResultCollection.insertOne(item);
            res.send(result);
        })

        app.post("/tests", verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await testCollection.insertOne(item);
            res.send(result);
        })

        app.delete("/tests/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await testCollection.deleteOne(query);
            res.send(result);
        })

        app.put('/tests/:id', async (req, res) => {
            const query = { _id: new ObjectId(req.params.id) };
            const data = {
                $set: {
                    title: req.body.title,
                    image: req.body.image,
                    date: req.body.date,
                    slots: req.body.slots,
                    short_description: req.body.short_description,
                    price: req.body.price,
                }
            }
            const result = await testCollection.updateOne(query, data);
            res.send(result);

        })

        // banner related api 
        app.post("/banners", verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await bannerCollection.insertOne(item);
            res.send(result);
        })

        app.get("/banners", async (req, res) => {
            const result = await bannerCollection.find().toArray();
            res.send(result);
        })

        app.delete("/banners/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await bannerCollection.deleteOne(query);
            res.send(result);
        })

        // payment Intent 
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // after payment booked tests 
        app.post('/booked-tests', async (req, res) => {
            const bookedTest = req.body;
            const bookedTestResult = await bookedTestCollection.insertOne(bookedTest);

            // update test collection 
            const updatedTestResult = await testCollection.updateOne({ title: bookedTest.testName }, { $inc: { slots_count: -1 } });

            res.send({ bookedTestResult, updatedTestResult });
        })


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('diagnostic center is running');
})

app.listen(port, () => {
    console.log(`listening on port ${port}`);
})