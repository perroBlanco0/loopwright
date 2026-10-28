"""Standalone smoke test for Nebius Token Factory Sandboxes (Contree SDK).

Not part of the Loopwright pipeline — this is a separate proof-of-concept
showing the agent's generated code could run inside a real Nebius Sandbox
instead of local Docker, for the hackathon write-up. Requires NEBIUS_API_KEY
and NEBIUS_PROJECT_ID in the environment.
"""

from contree_sdk import ContreeSync

client = ContreeSync()
sandbox = client.images.use("python:3.12-slim")

print("Installing a tool not present in the base image (qrencode)...")
sandbox.run("apt-get", args=["update", "-q"]).wait()
sandbox.run("apt-get", args=["install", "-y", "qrencode"]).wait()

generated_code = """
import subprocess
qr = subprocess.run(
    ["qrencode", "-t", "ANSIUTF8", "https://github.com/perroBlanco0/loopwright"],
    capture_output=True, text=True,
)
print(qr.stdout)
"""

print("Running model-style generated code inside the sandbox...")
result = sandbox.run("python", args=["-c", generated_code]).wait()
print(result.stdout)
print("Sandbox smoke test OK.")
