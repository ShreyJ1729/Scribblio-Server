const io = require("socket.io")();
const listOfWords = ["Cat", "Dog", "Dance", "Baseball", "Happy", "Important", "Explosion"];
// TODO LIST:
// - Make all the data here and there into one big users object (ket is socket is and values is an object with more infomation)



let users = {};
let usersReady = [];
let roundIsRunning = false;
let currentroundID = null;
let roundTimeInterval = 10 * 1000;
let gameHost = null;
const canvasBlankData = '{"lines":[{"points":[{"x":0,"y":0}, {"x":2000,"y":2000}],"brushColor":"#FFF","brushRadius":10000}],"width":"100%","height":"100%"}';


const welcomeMessage = "Hello and welcome to Scribblio! Please send '/ready' in the chat to let the server know you're ready to join a new game. On the left side there is a list of players with the color indicating their ready status.";
const gameAlreadyStartedMessage = "Lol you joined a bit too late. The game already started. Refresh when the current game ends to join.";

function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function clearScreen() {
    io.emit("canvas-change", { sender: "server", data: canvasBlankData });
}
// Add checker for all users ready or no

function allUsersReady() {
    // Sort and convert to strings since we cant compare arrays directly
    const stringifiedUsers = JSON.stringify(Object.values(users).sort());
    const stringifiedUsersThatAreReady = JSON.stringify(usersReady.sort());
    console.log("users in game: " + stringifiedUsers);
    console.log("users that are ready: " + stringifiedUsersThatAreReady);
    if (stringifiedUsers === stringifiedUsersThatAreReady) {
        return true;
    }
    return false;
}

function runRound(id, drawer, drawerID) {
    console.log("Started round.");
    clearScreen();
    io.emit("send-message", { sender: "Server", content: `Starting round... The first drawer is ${drawer}` });
    io.to(drawerID).emit("send-message", { sender: "Server", content: "Your word is Cat." });
    io.emit("drawer-change", drawer);
    // Give user some time to draw
    setTimeout(() => {
        // Check round ID if 
        if (roundIsRunning && id == currentroundID) {
            io.emit("send-message", { sender: "Server", content: "Time's Up! The word was Cat." })
            console.log("Ended game after successful round");
            roundIsRunning = false;
            usersReady = [];
            io.emit("ready-change", usersReady);
        } else {
            console.log("ERROR: ROUND IDs DON'T MATCH");
            console.log("Hoped to execute callback after timeout but round ended unexpectedly.");
            console.log("Round running: " + roundIsRunning);
            console.log("current/passed round id: " + currentroundID + " " + id);
        }
    }, roundTimeInterval)

}


io.on("connect", (client) => {
    // If a round is running already disconnect the client
    if (roundIsRunning) {
        client.emit("send-message", { sender: "Server", content: gameAlreadyStartedMessage });
        client.disconnect();
    }

    // Send the newly connected client a list of connected ppl (not them tho bc they haven't sent username yet)
    client.emit("user-list", Object.values(users));
    client.emit("new-host", gameHost);
    client.emit("ready-change", usersReady);

    // ALl the other stuff happend once the client connects with their username
    client.on("send-username", userThatJoined => {
        // Add client to userlist and send a message that (they have joined + update userlist)
        users[client.id] = userThatJoined;
        const joinMessage = `has joined the server.`
        io.emit("send-message", { username: userThatJoined, content: joinMessage, type: "meta-join" });
        io.emit("user-list", Object.values(users));
        io.emit("new-host", gameHost);
        client.emit("send-message", { sender: "Server", content: welcomeMessage });


        // If this client is the first to connect make the client host and drawer
        if (Object.keys(users).length === 1) {
            gameHost = userThatJoined;
            io.emit("new-host", gameHost);
            io.emit("drawer-change", userThatJoined);
        }


        client.on("send-message", msg => {
            let nameOfSender = users[client.id];
            console.log(nameOfSender + ": " + msg);


            // Logic to start game once everyone says "/ready"
            if (msg.toLowerCase() === "/ready") {
                if (!roundIsRunning) {
                    // console.log("got ready message and round was not running.");
                    if (!usersReady.includes(nameOfSender)) {
                        usersReady.push(nameOfSender);
                        // io.emit("send-message", { sender: "Server", content: `${nameOfSender} is ready!` });
                        io.emit("ready-change", usersReady);
                    }

                    if (allUsersReady()) {
                        console.log("All users ready!");
                        // THIS SHOULD BE A CONTIUOUS POPUP THING NOT A MESSAGE
                        io.emit("send-message", { sender: "Server", content: `All users are ready! ${gameHost} needs to say '/start' to begin the game.` })
                    }
                } else {
                    console.log("got ready message but round was already running.")
                }
            } else if (msg.toLowerCase() === "/unready") {
                if (usersReady.includes(nameOfSender)) {
                        usersReady = usersReady.filter(username => {
                            return username !== nameOfSender;
                        });
                        // io.emit("send-message", { sender: "Server", content: `${nameOfSender} is ready!` });
                        io.emit("ready-change", usersReady);
                    }
            } else if (msg.toLowerCase() === "/start") {
                if (nameOfSender === gameHost) {
                    if (allUsersReady()) {
                        currentroundID = Math.random();
                        roundIsRunning = true;
                        let firstDrawerID = getRandomElement(Object.keys(users));
                        let firstDrawerName = users[firstDrawerID]
                        runRound(currentroundID, firstDrawerName, firstDrawerID);
                    } else {
                        client.emit("send-message", { sender: "Server", content: "Can't start. Not everyone's ready." });
                    }
                } else {
                    client.emit("send-message", { sender: "Server", content: "You're not the host bro stop trying to start the game." });
                }
            } else {
                io.emit("send-message", { sender: nameOfSender, content: msg });
                io.emit("drawer-change", nameOfSender);
            }


        });



        client.on("disconnect", () => {
            // clearScreen();
            const userThatLeft = users[client.id];
            delete users[client.id];

            usersReady = usersReady.filter(username => {
                return username != userThatLeft;
            });
            console.log(userThatLeft + " left during game. New users list: " + users[usersReady]);

            if (Object.keys(users).length === 0) {
                users = {};
                usersReady = [];
                roundIsRunning = false;
                currentroundID = null;
                gameHost = null;
                console.log("No users active. Ended game and reset all defaults.");
            }

            const leaveMessage = `has left the server.`
            io.emit("send-message", { username: userThatLeft, content: leaveMessage, type: "meta-leave" });
            io.emit("user-list", Object.values(users));

            if (gameHost === userThatLeft) {
                let newHost = getRandomElement(usersReady)
                io.emit("new-host", newHost);
                io.emit("send-message", { sender: "Server", content: `The new host is ${newHost}` })
            }
        });




        client.on("canvas-change", canvasData => {
            console.log("Canvas changed");
            client.broadcast.emit("canvas-change", canvasData);
        });



    });
});

const port = process.env.PORT || 8000;
io.listen(port);
console.log(`Server started on port ${port}`);