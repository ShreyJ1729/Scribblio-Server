const io = require("socket.io")();

const users = {};
let usersReady = [];
let roundIsRunning = false;
let currentroundID = null;
let roundTimeInterval = 10 * 1000;
let gameHost = null;
// Add round ID to make it so that leaving and then coming back and starting a new round doesnt make the old callback appear.
function runRound(id) {

    if (roundIsRunning) {
        console.log("Started round.");
        let drawer = usersReady[Math.floor(Math.random() * usersReady.length)];
        io.emit("send-message", { sender: "Server", content: `Starting round... The first drawer is ${users[drawer]}` });
        io.to(drawer).emit("send-message", { sender: "Server", content: "Your word is Cat." });
        io.emit("drawer-change", users[drawer]);
        // Give user some time to draw
        setTimeout(() => {
            if (roundIsRunning && id == currentroundID) {
                io.emit("send-message", { sender: "Server", content: "Time's Up! The word was Cat." })
                console.log("Ended game after successful round");
                roundIsRunning = false;
                usersReady = [];
            } else {
                console.log("ERROR: ROUND IDs DON'T MATCH");
                console.log("Hoped to execute callback after timeout but round ended unexpectedly.");
                console.log("Round running: " + roundIsRunning);
                console.log("current/passed round id: " + currentroundID + " " + id);
            }
        }, roundTimeInterval)

    }
}



io.on("connect", (client) => {
    // If a round is running already disconnect the client
    if (roundIsRunning) {
        client.emit("send-message", { sender: "Server", content: "Lol you joined a bit too late. The round already started. Refresh when the round ends" });
        client.disconnect();
    }

    // Send the newly connected client a list of connected ppl (not them tho bc they haven't sent username yet)
    client.emit("user-list", Object.values(users));

    // ALl the other stuff happend once the client connects with their username
    client.on("send-username", userThatJoined => {
        // Add client to userlist and send a message that (they have joined + update userlist)
        users[client.id] = userThatJoined;
        const joinMessage = `has joined the server.`
        io.emit("send-message", { username: userThatJoined, content: joinMessage, type: "meta-join" });
        io.emit("user-list", Object.values(users));
        io.emit("new-host", gameHost);


        // If this client is the first to connect make the client host
        if (Object.keys(users).length === 1) {
            gameHost = users[client.id]
            io.emit("new-host", gameHost);
        }


        client.on("send-message", msg => {
            io.emit("send-message", { sender: users[client.id], content: msg });
            io.emit("drawer-change", users[client.id]);
            console.log(msg);


            // Logic to start game once everyone says "/ready"
            if (msg.toLowerCase() === "/ready") {
                if (!roundIsRunning) {
                    console.log("got ready message and round was not running.");
                    if (!usersReady.includes(client.id)) {
                        usersReady.push(client.id);
                    }
                    // Sort and convert to strings since we cant compare arrays directly
                    let usersInGame = JSON.stringify(Object.keys(users).sort());
                    let usersThatAreReady = JSON.stringify(usersReady.sort());
                    console.log("users in game: " + usersInGame);
                    console.log("users that are ready: " + usersThatAreReady);

                    if (usersInGame === usersThatAreReady && usersInGame !== 0) {
                        roundIsRunning = true;
                        console.log("starting game...");
                        currentroundID = Math.random();
                        runRound(currentroundID);
                    }
                } else {
                    console.log("got ready message but round was already running.")
                }
            }


        });



        client.on("disconnect", () => {
            const userThatLeft = users[client.id];

            if (roundIsRunning) {
                usersReady = usersReady.filter(userid => {
                    return users[userid] != userThatLeft
                });
                console.log(userThatLeft + " left during game. New users list: " + users[usersReady]);
            }

            delete users[client.id];
            const leaveMessage = `has left the server.`
            io.emit("send-message", { username: userThatLeft, content: leaveMessage, type: "meta-leave" });
            io.emit("user-list", Object.values(users));

            if (Object.keys(users).length === 0 && roundIsRunning) {
                roundIsRunning = false;
                usersReady = [];
                console.log("No users active. Ended game.")
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