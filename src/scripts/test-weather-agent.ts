import { weatherAgent } from "../agents/weather-agent";

async function main() {
    const res = await weatherAgent.generate([
        { role: "user", content: "Hello! Let's test the weather agent. My zipcode is 94102" },
    ]);
    console.log(res.text);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});