interface ChatMessageProps {
  message: Message;
  isOwnMessage: boolean;
}

function ChatMessage({ message, isOwnMessage }: ChatMessageProps) {
  return (
    <div
      className={`flex ${isOwnMessage ? "justify-end" : "justify-start"} mb-4`}
    >
      <div
        className={`rounded-lg p-3 max-w-[70%] ${
          isOwnMessage ? "bg-blue-600" : "bg-gray-700"
        }`}
      >
        {message.content && <p className="text-white">{message.content}</p>}
        {message.imageUrl && (
          <img
            src={message.imageUrl}
            alt="Chat image"
            className="max-w-full rounded-lg mt-2"
            onClick={() => {
              /* Add image preview logic */
            }}
          />
        )}
        <span className="text-xs text-gray-400 mt-1 block">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
