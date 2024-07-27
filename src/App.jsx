import { useState, useEffect, useRef } from "react";
import axios from "axios";
import Loader from "./Loader.jsx";
import pdfToText from "react-pdftotext";
import { IoMdMicOff } from "react-icons/io";
import ReactMarkdown from "react-markdown";
import { BsFillRecord2Fill } from "react-icons/bs";
import MonsterApiClient from "monsterapi";
import "./App.css";
import { MdAttachFile } from "react-icons/md";
import {FiMenu} from "react-icons/fi";

const audioBlobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const arrayBuffer = reader.result;
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );
      resolve(base64Audio);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
};

const AVAILABLE_MODELS = [
  'models/gemini-1.5-flash','models/gemini-1.0-pro', 'models/gemini-1.0-pro-001', 'models/gemini-1.0-pro-latest',
  'models/gemini-1.0-pro-vision-latest',  'models/gemini-1.5-flash-001',
  'models/gemini-1.5-flash-latest', 'models/gemini-1.5-pro', 'models/gemini-1.5-pro-001',
  'models/gemini-1.5-pro-latest', 'models/gemini-pro', 'models/gemini-pro-vision'
];

let currentUtterance = null;

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [transcription, setTranscription] = useState("");
  const [pdfText, setPdfText] = useState("");
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0]);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [file, setFile] = useState(null);
  const [apiKeyFormVisible, setApiKeyFormVisible] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [monsterApiKey, setMonsterApiKey] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const msgRef = useRef(null);
  const pdfFileInputRef = useRef(null);
  const imageFileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [isNavOpen, setIsNavOpen] = useState(false);

  useEffect(() => {
      // Simulate a network request to fetch initial data
      setTimeout(() => {
          setLoading(false); // Set loading to false after the request is complete
      }, 3000); // Adjust this delay as needed
  }, []);

  useEffect(() => {
    return () => {
      if (mediaRecorder) {
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [mediaRecorder]);

  useEffect(() => {
    msgRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  const handleModelChange = (e) => {
    setSelectedModel(e.target.value);
  };

  const handleSendMessage = async () => {
    if (input.trim() === "" && !file) return;
    if (currentUtterance) {
        window.speechSynthesis.cancel();
    }

    const userMessage = { from: "user", text: input, image: file ? URL.createObjectURL(file) : null };
    setMessages([...messages, userMessage]);
    setInput("");
    setFile(null);

    if (input.toLowerCase().startsWith("generate")) {
      await handleGenerateImage(input);
      return;
    }

    const formData = new FormData();
    formData.append("message", input);
    formData.append("context", pdfText);
    formData.append("model", selectedModel);
    formData.append("geminiApiKey", geminiApiKey);
    if (file) {
        formData.append("file", file);
    }

    try {
        const response = await fetch("https://botserver.applikuapp.com/chat", {
            method: "POST",
            body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "An error occurred");
        }
        const botMessage = { from: "bot", text: data.response, image: data.image_url };
        setMessages((prevMessages) => [...prevMessages, botMessage]);
    } catch (error) {
        console.error(error);
        alert("An error occurred. Please try again.");
    }
  };

  const handleGenerateImage = async (prompt) => {
    const model = "txt2img";
    const input = { prompt: prompt.replace("generate", "").trim() };
    const monsterClient = new MonsterApiClient(monsterApiKey);

    console.log("Generating image with prompt:", input);

    try {
      const response = await monsterClient.generate(model, input);
      console.log("MonsterAPI response:", response);

      if (response.output && response.output.length > 0) {
        const imageUrl = response.output[0];
        setGeneratedImage(imageUrl);
        const botMessage = { from: "bot", text: `![Generated Image](${imageUrl})` };
        setMessages((prevMessages) => [...prevMessages, botMessage]);
        speakText("Here is the generated image.");
      } else {
        console.error("Image generation failed:", response);
        const botMessage = { from: "bot", text: "Failed to generate image. Please try again." };
        setMessages((prevMessages) => [...prevMessages, botMessage]);
        speakText("Failed to generate image. Please try again.");
      }
    } catch (error) {
      console.error("Error generating image:", error);
      alert("Failed to generate image. Please try again.");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSendMessage().then(r => r);
    }
  };

  const startRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    recorder.start();
    console.log("Recording started");

    recorder.addEventListener("dataavailable", async (event) => {
      const audioBlob = event.data;
      console.log("Audio blob:", audioBlob);

      const base64Audio = await audioBlobToBase64(audioBlob);
      console.log("Base64 audio:", base64Audio);

      console.log("Audio blob size:", audioBlob.size);
      console.log("Audio blob type:", audioBlob.type);

      try {
        const response = await axios.post(
          `https://speech.googleapis.com/v1/speech:recognize?key=${googleApiKey}`,
          {
            config: {
              encoding: "WEBM_OPUS",
              sampleRateHertz: 48000,
              languageCode: "en-US",
            },
            audio: {
              content: base64Audio,
            },
          }
        );

        console.log("Google Speech-to-Text API response:", response.data);

        if (response.data.results && response.data.results.length > 0) {
          const transcript = response.data.results[0].alternatives[0].transcript;
          console.log("Transcript:", transcript);
          setTranscription(transcript);
          setInput(transcript);
        } else {
          setTranscription("No transcription available");
          console.log("No transcription available");
        }
      } catch (error) {
        console.error("Error with Google Speech-to-Text API:", error.response?.data || error.message);
      }
    });

    setRecording(true);
    setMediaRecorder(recorder);
  } catch (error) {
    console.error("Error getting user media:", error);
  }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      console.log("Recording stopped");
      setRecording(false);
    }
  };

  const extractText = async (event) => {
    const file = event.target.files[0];
    try {
      const text = await pdfToText(file);
      setPdfText(text);
      alert("Text extracted successfully");
      pdfFileInputRef.current.value = "";
    } catch (error) {
      console.error("Failed to extract text from PDF", error);
    }
  };

  const clearPdfText = () => {
    setPdfText("");
    pdfFileInputRef.current.value = "";
  };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            alert("Text copied to clipboard!");
        }).catch((error) => {
            console.error("Failed to copy text: ", error);
        });
    };

    const speakText = (text) => {
      if (!window.speechSynthesis) {
          console.warn("Speech synthesis is not supported in this browser");
          return;
      }

      if (currentUtterance) {
          window.speechSynthesis.cancel();
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => {
          console.log("Speech ended");
      };
      utterance.onerror = (event) => {
          console.error("Speech error:", event.error);
      };

      currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
  };

  const handleSubmitApiKeys = (e) => {
    e.preventDefault();
    setApiKeyFormVisible(false);
  };

  return (
    <div className="App">
        {loading ? (
            <Loader />
        ) : (
            <div className="one_p">
                <div className="left-nav">
                    <div className="title">
                        <h2></h2>
                    </div>
                    <select value={selectedModel} onChange={handleModelChange} className="model_select">
                        {AVAILABLE_MODELS.map((model) => (
                            <option key={model} value={model}>
                                {model}
                            </option>
                        ))}
                    </select>
                    <input
                        type="file"
                        className="self_center choose_btn"
                        accept="application/pdf"
                        onChange={extractText}
                        ref={pdfFileInputRef}
                    />
                    <div className="extracted-text">
                        <h2 className="self_center">Extracted Text</h2>
                        <pre>{pdfText}</pre>
                    </div>
                    <button onClick={clearPdfText} className="clear_btn">
                        Clear
                    </button>
                </div>
                <div className={`floating-nav ${isNavOpen ? "active" : ""}`}>
                    <div className="title1">
                        <br/>
                        <h2>AI Chat Bot</h2>
                    </div>
                    <select value={selectedModel} onChange={handleModelChange} className="model_select">
                        {AVAILABLE_MODELS.map((model) => (
                            <option key={model} value={model}>
                                {model}
                            </option>
                        ))}
                    </select>
                    <input
                        type="file"
                        className="self_center choose_btn"
                        accept="application/pdf"
                        onChange={extractText}
                        ref={pdfFileInputRef}
                    />
                    <div className="extracted-text">
                        <h2 className="self_center">Extracted Text</h2>
                        <pre>{pdfText}</pre>
                    </div>
                    <button onClick={clearPdfText} className="clear_btn">
                        Clear
                    </button>
                </div>
                <div className="vertical-line"></div>
                <div className="one_p chat_bot">
                    <div className="title">
                        <button className="nav-icon" onClick={() => setIsNavOpen(!isNavOpen)}>
                            <FiMenu/>
                        </button>
                        <h2 id="head"><span className="highlight"> AI </span>Chat Bot</h2>
                    </div>
                    <div className="parent_chat">
                        <div className="chat-window">
                            {messages.map((msg, index) => (
                                <div key={index} className={`message ${msg.from}`} ref={msgRef}>
                                    <p className="txt">
                                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                                        {msg.from === 'user' && msg.image &&
                                            <img src={msg.image} alt="attached" style={{maxWidth: "100%"}}/>}
                                        {msg.from === "bot" && (
                                            <div className="bot-actions">
                                                <button onClick={() => speakText(msg.text)}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" height="24px"
                                                         viewBox="0 -960 960 960"
                                                         width="18px" fill="#e8eaed">
                                                        <path
                                                            d="M560-131v-82q90-26 145-100t55-168q0-94-55-168T560-749v-82q124 28 202 125.5T840-481q0 127-78 224.5T560-131ZM120-360v-240h160l200-200v640L280-360H120Zm440 40v-322q47 22 73.5 66t26.5 96q0 51-26.5 94.5T560-320ZM400-606l-86 86H200v80h114l86 86v-252ZM300-480Z"/>
                                                    </svg>
                                                </button>
                                                <button onClick={() => copyToClipboard(msg.text)}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" height="20px"
                                                         viewBox="0 -960 960 960"
                                                         width="18px" fill="#e8eaed">
                                                        <path
                                                            d="M360-240q-29.7 0-50.85-21.15Q288-282.3 288-312v-480q0-29.7 21.15-50.85Q330.3-864 360-864h384q29.7 0 50.85 21.15Q816-821.7 816-792v480q0 29.7-21.15 50.85Q773.7-240 744-240H360Zm0-72h384v-480H360v480ZM216-96q-29.7 0-50.85-21.15Q144-138.3 144-168v-552h72v552h456v72H216Zm144-216v-480 480Z"/>
                                                    </svg>
                                                </button>
                                            </div>)}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <div className="parent_prompt">
                            <button onClick={() => setApiKeyFormVisible(true)} className="cred">APIS</button>
                            <button onClick={() => imageFileInputRef.current.click()} className="btn_attach">
                                <MdAttachFile/>
                            </button>
                            <input
                                type="file"
                                style={{display: "none"}}
                                accept="image/*"
                                ref={imageFileInputRef}
                                onChange={(e) => setFile(e.target.files[0])}
                            />
                            <div className="prompt">
                                <input
                                    id="msg"
                                    className="bg-[#222630] px-4 py-3 outline-none w-[90%] text-white rounded-lg border-2 transition-colors duration-100 border-solid focus:border-[#596A95] border-[#2B3040]"
                                    type="text"
                                    spellCheck="true"
                                    lang="en"
                                    placeholder={`message ${selectedModel}`}
                                    value={input}
                                    onChange={handleInputChange}
                                    onKeyDown={handleKeyDown}
                                />
                            </div>
                            <button onClick={handleSendMessage} className="btn_send" id="send">
                                <div className="svg-wrapper-1">
                                    <div className="svg-wrapper">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 24 24"
                                            width="24"
                                            height="24"
                                        >
                                            <path fill="none" d="M0 0h24v24H0z"></path>
                                            <path
                                                fill="currentColor"
                                                d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z"
                                            ></path>
                                        </svg>
                                    </div>
                                </div>
                                <span>Send</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>)}
        {apiKeyFormVisible && (
            <div className="popup">
                <div className="popup-inner">
                    <form onSubmit={handleSubmitApiKeys} className="api-key-form">
            <label>
              Gemini API Key:
              <input
                type="text"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
              />
            </label>
            <label>
              Monster API Key:
              <input
                type="text"
                value={monsterApiKey}
                onChange={(e) => setMonsterApiKey(e.target.value)}
              />
            </label>
            <label>
              Google API Key:
              <input
                type="text"
                value={googleApiKey}
                onChange={(e) => setGoogleApiKey(e.target.value)}
              />
            </label>
            <button type="submit" className="api-submit">Submit</button>
            <button type="button" className="api-close" onClick={() => setApiKeyFormVisible(false)}>Close</button>
          </form>
        </div>
      </div>
    )}
    </div>
  );
}

export default App;
