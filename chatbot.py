
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader
from llama_index.llms.openai import OpenAI
import os
import os.path
import openai
from getpass import getpass
from dotenv import load_dotenv

load_dotenv()

llm = OpenAI(model="gpt-4o")
data = SimpleDirectoryReader(input_dir="data_sources/paul_graham").load_data()
index = VectorStoreIndex.from_documents(data)

chat_engine = index.as_chat_engine(chat_model="best",llm=llm,verbose=True)

# response = chat_engine.chat(
#     "what are the first programs Paul Graham tried writing"
# )

while True:
    text_input = input("User: ")
    print("\n")

    if text_input == "exit":
        break
    response = chat_engine.chat(text_input)
    print(f"Agent : {response}")
