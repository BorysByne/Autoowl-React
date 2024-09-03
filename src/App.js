import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input, Button } from 'react-chat-elements';
import 'react-chat-elements/dist/main.css';
import ReactMarkdown from 'react-markdown';
import './AiChat.css';

const API_KEY = 'bdocs-wIV08x7k2tDl868xOgO82qoEdbjvI_1sTop-_cdMdME';
const AGENT_ID = '64d09a6f-0ad9-403c-ae27-a19b266a0233';
const DOMAIN = 'app.docs.bynesoft.com';

const BYNE_HEADER = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json',
  'Transfer-Encoding': 'chunked'
};

let messageIdCounter = 0;

const ImageCarousel = ({ images }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextImage = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + images.length) % images.length);
  };

  return (
    <div className="image-carousel">
      <img src={images[currentIndex]} alt={`Car ${currentIndex + 1}`} />
      <div className="carousel-controls">
        <button onClick={prevImage}>&lt;</button>
        <span>{currentIndex + 1} / {images.length}</span>
        <button onClick={nextImage}>&gt;</button>
      </div>
    </div>
  );
};

const CarWidget = ({ car, isMultiple, onLearnMore }) => {
  const images = car.images?.map(img => 'https://purple-lake-654a.b-nadykto.workers.dev/' + img.srcset.split(' ')[0]) || [];

  return (
    <div className="car-widget">
      <h3>{car.description?.title || car.make?.name + ' ' + car.model?.name || 'Unknown Car'}</h3>

      <p><strong>Make:</strong> {car.make?.name || car.general?.make?.name || 'Unknown'}</p>
      <p><strong>Model:</strong> {car.model?.name || car.general?.model?.name || 'Unknown'}</p>
      <p><strong>Year:</strong> {car.year || car.general?.year || 'Unknown'}</p>
      <p><strong>Mileage:</strong> {car.mileage?.formatted || car.condition?.odometer?.formatted || 'Unknown'}</p>
      <p><strong>Price:</strong> {car.price?.formatted || car.sales_conditions?.pricing?.asking?.consumer?.formatted || 'Unknown'}</p>
      <p><strong>Fuel Type:</strong> {car.fuelType || car.powertrain?.engine?.energy?.type?.category?.display_value || 'Unknown'}</p>
      <p><strong>Transmission:</strong> {car.transmission || car.powertrain?.transmission?.type?.display_value || 'Unknown'}</p>
      {isMultiple && <p><strong>ID:</strong> {car.id || 'Unknown'}</p>}

      {images.length > 1 ? (
        <ImageCarousel images={images} />
      ) : (
        <img src={images[0] || ''} alt="Car" style={{maxWidth: '100%', height: 'auto'}} />
      )}

      {isMultiple && (
        <button className="learn-more-button" onClick={() => onLearnMore(car.id)}>Learn more</button>
      )}
    </div>
  );
};

const Spinner = () => (
  <div className="spinner message left">
    <div className="bounce1"></div>
    <div className="bounce2"></div>
    <div className="bounce3"></div>
  </div>
);


const ReferenceWidget = ({ url, title }) => {
  const host = new URL(url).hostname.replace('www.', '');
  const siteName = host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1);

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="reference-widget">
      <div className="reference-content">
        <div className="reference-site">{siteName}</div>
        <div className="reference-title">{title}</div>
      </div>
      <div className="reference-arrow">→</div>
    </a>
  );
};

const AiChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [convId, setConvId] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const chatEndRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const handleStreamResponse = useCallback(async (response) => {
    setIsStreaming(true);
    const reader = response.body.getReader();
    let buffer = '';
    let completeMessage = '';
    let references = [];
    let lastChunkTime = Date.now();

    const processChunk = async (chunk) => {
      buffer += chunk;

      let startIndex = 0;
      while (true) {
        const endIndex = buffer.indexOf('}{', startIndex);
        if (endIndex === -1) break;

        const jsonString = buffer.substring(startIndex, endIndex + 1);
        startIndex = endIndex + 1;

        try {
          const data = JSON.parse(jsonString);
          if (data.response?.answer) {
            completeMessage += data.response.answer;
            updateMessage(completeMessage);
            await new Promise(resolve => setTimeout(resolve, 30)); // 30ms delay
            lastChunkTime = Date.now();
            setIsLoading(false);
          }
          if (data.conversation_id) {
            setConvId(data.conversation_id);
          }
          if (data.response?.reference?.length > 0) {
            references = references.concat(data.response.reference);
          }
        } catch (error) {
          console.error('Error parsing JSON:', error);
        }
      }

      buffer = buffer.substring(startIndex);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const currentTime = Date.now();
      if (currentTime - lastChunkTime > 100) { // If more than 0.1 second has passed since the last chunk
        setIsLoading(true);
      }

      await processChunk(new TextDecoder().decode(value));
    }

    // Process any remaining data in the buffer
    if (buffer) {
      await processChunk(buffer);
    }

    setIsLoading(false);

    // Handle all collected references after processing the entire response
    if (references.length > 0) {
      handleReferences(references);
    }
    setIsStreaming(false);
  }, []);

  const initMessage = useCallback(async () => {
    try {
      const response = await fetch(`https://${DOMAIN}/api/ask/agents/${AGENT_ID}/query?stream=True&q=[You are AutoOwl, an AI car concierge. Respond in the same language as the customer. Begin the chat in English, introduce yourself and provide a disclaimer informing the customer that you can make mistakes.]`, {
        method: 'POST',
        headers: BYNE_HEADER,
        body: '{}'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await handleStreamResponse(response);
    } catch (e) {
      console.error("Error in initMessage:", e);
      setError(`Failed to initialize chat: ${e.message}`);
    }
  }, [handleStreamResponse]);

  useEffect(() => {
    initMessage();
  }, [initMessage]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const scrollToBottom = () => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  };

  const handleReferences = (references) => {
  console.log('Received references:', references);
  if (references.length === 0) {
    console.log('No references received');
    return;
  }

  const strSource = references[0].source;
  console.log('Source string:', strSource);

  const isLink = strSource.startsWith('http');
  if (isLink) {
    const referenceMessages = references.map(ref => ({
      id: `ref_${messageIdCounter++}`,
      position: 'left',
      type: 'reference',
      url: ref.source,
      title: ref.title,
      date: new Date()
    }));
    setMessages(prevMessages => [...prevMessages, ...referenceMessages]);
  } else {
    try {
      const source = JSON.parse(strSource);
      console.log('Parsed source:', source);

      if (source && typeof source === 'object') {
        console.log('Source keys:', Object.keys(source));
        if (source.results && Array.isArray(source.results)) {
          console.log('Results array length:', source.results.length);
          outputCars(source.results);
        } else if (source.vehicle) {
          console.log('Single vehicle data:', source.vehicle);
          outputCars([source.vehicle]); // Pass as an array with a single vehicle
        } else {
          console.log('Muted reference:');
          console.log('source:', source);
        }
      } else {
        console.error('Invalid car data structure: source is not an object');
        setError('Received invalid car data structure');
      }
    } catch (error) {
      console.error('Error parsing car data:', error);
      console.log('Raw strSource:', strSource);
      setError('Failed to parse car data');
    }
  }
};

  const updateMessage = (message) => {
    setMessages(prevMessages => {
      if (prevMessages.length > 0 && prevMessages[prevMessages.length - 1].position === 'left') {
        const updatedMessages = [...prevMessages];
        updatedMessages[prevMessages.length - 1] = {
          ...updatedMessages[prevMessages.length - 1],
          text: message
        };
        return updatedMessages;
      } else {
        return [...prevMessages, {
          id: `msg_${messageIdCounter++}`,
          position: 'left',
          type: 'text',
          text: message,
          date: new Date()
        }];
      }
    });
  };

  const handleSendMessage = async (e, customMessage = null) => {
    e.preventDefault();
    const messageToSend = customMessage || inputMessage;
    if (!messageToSend.trim() || isStreaming) return;


    setMessages(prevMessages => [...prevMessages, {
      id: `msg_${messageIdCounter++}`,
      position: 'right',
      type: 'text',
      text: messageToSend,
      date: new Date()
    }]);
    setInputMessage('');

    try {
      const response = await fetch(`https://${DOMAIN}/api/ask/agents/${AGENT_ID}/query?q=${encodeURIComponent(messageToSend)}&withReference=true&stream=True`, {
        method: 'POST',
        headers: BYNE_HEADER,
        body: JSON.stringify({
          conversation: {
            id: convId,
            priorMessagesCount: 15
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await handleStreamResponse(response);
    } catch (error) {
      console.error('Error sending message:', error);
      setError(`Failed to send message: ${error.message}`);
      setIsStreaming(false);
    }
  };


  const convertLinkToMarkdown = (url, title) => {
    const host = new URL(url).hostname.replace('www.', '');
    const siteName = host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1);
    return `[${siteName} – ${title}](${url})`;
  };

  const outputCars = (carData) => {
    console.log('Received car data:', carData);

    if (!Array.isArray(carData)) {
      console.error('Car data is not an array:', carData);
      setError('Received invalid car data');
      return;
    }

    const isMultiple = carData.length > 1;

    const carMessages = carData.map(car => {
      console.log('Processing car:', car);
      return {
        id: `car_${messageIdCounter++}`,
        position: 'left',
        type: 'car',
        car: car,
        isMultiple: isMultiple,
        date: new Date()
      };
    });

    setMessages(prevMessages => [...prevMessages, ...carMessages]);
  };

  const handleLearnMore = (carId) => {
    const learnMoreMessage = `I want to learn more about the car with ID ${carId}`;
    handleSendMessage({ preventDefault: () => {} }, learnMoreMessage);
  };

const renderMessage = (message) => {
  if (!message) {
    console.error('Attempted to render undefined message');
    return null;
  }

  switch (message.type) {
    case 'car':
      return (
        <CarWidget
          key={message.id}
          car={message.car}
          isMultiple={message.isMultiple}
          onLearnMore={handleLearnMore}
        />
      );
    case 'reference':
      return (
        <ReferenceWidget
          key={message.id}
          url={message.url}
          title={message.title}
        />
      );
    case 'text':
    default:
      return (
        <div key={message.id} className={`message ${message.position}`}>
          <ReactMarkdown components={{
            img: ({node, ...props}) => (
              <img style={{maxWidth: '100%', height: 'auto'}} {...props} alt="Car" />
            )
          }}>
            {message.text}
          </ReactMarkdown>
        </div>
      );
  }
};



  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={`app-container ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="background-image"></div>
      <div className="ai-chat">
        {isExpanded ? (
            <>
              <div className="chat-panel">
                <img src="https://autoowl.ai/icons/Icon-192.png" alt="AutoOwl" className="avatar"/>
                <span className="chat-title">AutoOwl</span>
                <button className="toggle-button" onClick={toggleExpand}>
                  ▼
                </button>
              </div>
              {error && <div className="error-message">{error}</div>}
              <div className="chat-messages" ref={chatMessagesRef}>
                {messages.map(renderMessage)}
                {isLoading && <Spinner/>}
                <div ref={chatEndRef}/>
              </div>
              <form onSubmit={handleSendMessage} className="input-area">
                <Input
                    placeholder="Type your message..."
                    multiline={false}
                    onChange={(e) => setInputMessage(e.target.value)}
                    value={inputMessage}
                    rightButtons={
                      <Button
                          color='white'
                          backgroundColor='black'
                          text='Send'
                          onClick={handleSendMessage}
                          disabled={isStreaming}
                      />
                    }
                />
              </form>
            </>
        ) : (
            <button className="expand-button" onClick={toggleExpand}>
              <img src="https://autoowl.ai/icons/Icon-192.png" alt="AutoOwl" className="avatar"/>
            </button>
        )}
      </div>
    </div>
  );
};

export default AiChat;