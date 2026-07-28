import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Split } from '../../entities/split.entity';

/**
 * Highlighted matches for search result display
 * These contain the matched text with <em> tags for frontend highlighting
 */
export class SearchHighlightsDto {
  @ApiPropertyOptional({ 
    description: 'Highlighted description snippet with matched terms wrapped in <mark> tags'
  })
  description?: string;

  @ApiPropertyOptional({ 
    description: 'Array of highlighted item names that matched the query',
    type: [String]
  })
  itemNames?: string[];
}

/**
 * Single search result item with relevance info
 * I'm including the score so the frontend could optionally show relevance
 */
export class SearchResultItemDto {
  @ApiProperty({ description: 'The matched split entity' })
  split!: Split;

  @ApiProperty({ 
    description: 'Highlighted text snippets showing where matches occurred',
    type: SearchHighlightsDto
  })
  highlights!: SearchHighlightsDto;

  @ApiProperty({ 
    description: 'Relevance score (higher = more relevant)',
    example: 0.85
  })
  score!: number;
}

/**
 * Paginated search response
 * Using cursor-based pagination for stable results during scrolling
 */
export class SearchResultDto {
  @ApiProperty({ 
    description: 'Array of search results',
    type: [SearchResultItemDto]
  })
  data!: SearchResultItemDto[];

  @ApiProperty({ 
    description: 'Total number of matching results',
    example: 42
  })
  total!: number;

  @ApiPropertyOptional({ 
    description: 'Cursor for fetching the next page (null if no more results)'
  })
  cursor?: string | null;

  @ApiProperty({ 
    description: 'Whether more results are available',
    example: true
  })
  hasMore!: boolean;
}
